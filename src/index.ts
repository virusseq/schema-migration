/*
 * Copyright (c) 2022 The Ontario Institute for Cancer Research. All rights reserved
 *
 * This program and the accompanying materials are made available under the terms of
 * the GNU Affero General Public License v3.0. You should have received a copy of the
 * GNU Affero General Public License along with this program.
 *  If not, see <http://www.gnu.org/licenses/>.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT
 * SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
 * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
 * IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
 * ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import config, { getSecrets } from './config';
import createSongClient, { AnalysisFilters } from './external/song';
import Logger, { LogLevel } from './logger';
import limitConcurrency from './structures/limitConcurrency';
import { asyncPipe } from './structures/pipe';
import getAvailableStudies from './tasks/getAvailableStudies';
import migrateAndUpdateStudy from './tasks/migrateAndUpdateStudy';
import { mapAsync } from './utils/arrayUtils';
import { pipeLog } from './utils/pipeUtils';
const logger = Logger('Main');

const run = async () => {
	try {
		const secrets = await getSecrets();

		const songClient = createSongClient({
			host: config.song.host,
			name: config.song.name,
			ego: {
				host: config.ego.host,
				appCredentials: secrets.credentials,
			},
		});

		if (!secrets.credentials.id || !secrets.credentials.secret) {
			throw new Error('Cannot run migration script, no Application Credentials are available.');
		}

		logger.info(`Beginning Migration Script`);
		logger.info(`Song`, config.song.host);
		logger.info(`Ego`, config.ego.host);
		logger.info(`Migration Version`, config.migration.use14 ? 14 : 13);

		/**
		 * 1. Get all studies
		 * 2. Perform migration for all analyses in each study
		 *    - limit this to one study at a time
		 * 3. Log results and check for completion.
		 */

		const limitedMigrateStudy = limitConcurrency(1, migrateAndUpdateStudy(songClient));

		const summary = await asyncPipe(getAvailableStudies(songClient))
			// .into(pipeLog(logger, LogLevel.DEBUG, 'Available Studies'))
			// .into((studies) => (studyFilter.length ? studies.filter((study) => studyFilter.includes(study)) : studies))
			.into(pipeLog(logger, LogLevel.DEBUG, 'Studies to Migrate'))
			.await(mapAsync(limitedMigrateStudy))
			.into(pipeLog(logger, LogLevel.INFO, 'Summary'))
			.run();

		if (summary.success) {
			const failures = summary.data.filter((study) => !study.completed).map((study) => study.study);
			if (failures.length) {
				// Some of our studies didn't complete, may need to run again
				logger.warn('Some studies did not complete, we may need to repeat the migration pipeline', failures);
			}
		}

		logger.info('Migration pipeline completed without error.');
	} catch (e) {
		logger.error(`Uncaught error during pipeline execution`, e);
		// Throw the error so our job reports as failed
		process.exit(1);
	} finally {
		logger.info('All done! Exiting!');
	}
};

run();
