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

import _ from 'lodash';
import { z as zod } from 'zod';
import { Analysis } from '../../../external/song/types';
import { Result } from '../../../types';
import { failure, success } from '../../../types/result';
import { defineTransform } from '../../transform';
import { CS_NAME } from './constants';

/*
 * Version 3 to 4 Transform
 * - Adds regex validation on sample_collection.fasta_header_name
 */

const InputSchema = zod.object({
	analysisType: zod.object({
		name: zod.literal(CS_NAME),
		version: zod.literal(3),
	}),
	sample_collection: zod.object({
		fasta_header_name: zod.string(),
	}),
});
type InputSchema = zod.infer<typeof InputSchema>;

const matchesInputSchema = (input: Analysis): input is Analysis & InputSchema => InputSchema.safeParse(input).success;

const fasta_header_nameRegex = /^hCoV-19\/(canada)\/[a-zA-Z0-9\-_\.:/]{1,99}\/20[1-2][0-9]$/i;

const transform = (analysis: Analysis): Result<Analysis> => {
	if (!matchesInputSchema(analysis)) {
		return failure('Provided analysis does not match the version 3 schema and cannot be migrated to version 4');
	}

	const currentFastaHeaderName = analysis.sample_collection.fasta_header_name;
	if (!fasta_header_nameRegex.test(currentFastaHeaderName)) {
		return failure(
			'Cannot update `sample_collection.fasta_header_name` since the available value does not match the required regular expression.',
			analysis.studyId,
			analysis.analysisId,
			analysis.sample_collection.fasta_header_name,
		);
	}

	return success(
		Object.assign(_.cloneDeep(analysis), {
			sample_collection: { ...analysis.sample_collection, fasta_header_name: currentFastaHeaderName },
		}),
	);
};

export default defineTransform({ start: { name: CS_NAME, version: 3 }, end: { name: CS_NAME, version: 4 } }, transform);
