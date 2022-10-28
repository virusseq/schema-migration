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
 * Version 5 to 6 Transform
 * - Enforce that host_age fits within host_age_bucket
 * - Transform host_age_bin 90-99 and 100+ into 90+
 * - Set host_age to null if host_age_bin is `90-99` or `100+` (now set to `90+`)
 */

const InputSchema = zod.object({
	analysisType: zod.object({
		name: zod.literal(CS_NAME),
		version: zod.literal(5),
	}),
	host: zod.object({
		host_age: zod.number().nullable(),
		host_age_bin: zod.enum([
			'0 - 9',
			'10 - 19',
			'20 - 29',
			'30 - 39',
			'40 - 49',
			'50 - 59',
			'60 - 69',
			'70 - 79',
			'80 - 89',
			'90 - 99',
			'100+',
			'Not Applicable',
			'Missing',
			'Not Collected',
			'Not Provided',
			'Restricted Access',
		]),
	}),
});
type InputSchema = zod.infer<typeof InputSchema>;

const matchesInputSchema = (input: Analysis): input is Analysis & InputSchema => InputSchema.safeParse(input).success;

/**
 * Return if age is wihtin the min/max range (inclusive)
 * @param min
 * @param max
 * @param age
 * @returns
 */
const isValidAgeBin =
	(min: number, max: number) =>
	(age: number | null): boolean => {
		return age === null || (age >= min && age <= max);
	};

const getAgeBinValidator = (
	bin: '0 - 9' | '10 - 19' | '20 - 29' | '30 - 39' | '40 - 49' | '50 - 59' | '60 - 69' | '70 - 79' | '80 - 89',
): ((age: number | null) => boolean) => {
	const decade = Number(bin.charAt(0)) * 10;
	return isValidAgeBin(decade, decade + 9);
};

const transform = (analysis: Analysis): Result<Analysis> => {
	if (!matchesInputSchema(analysis)) {
		return failure('Provided analysis does not match the version 5 schema and cannot be migrated to version 6');
	}

	// Check age is within age_bucket range, or a null reason is provided
	switch (analysis.host.host_age_bin) {
		case '0 - 9':
		// fallthrough to '80 - 89'
		case '10 - 19':
		// fallthrough to '80 - 89'
		case '20 - 29':
		// fallthrough to '80 - 89'
		case '30 - 39':
		// fallthrough to '80 - 89'
		case '40 - 49':
		// fallthrough to '80 - 89'
		case '50 - 59':
		// fallthrough to '80 - 89'
		case '60 - 69':
		// fallthrough to '80 - 89'
		case '70 - 79':
		// fallthrough to '80 - 89'
		case '80 - 89':
			if (getAgeBinValidator(analysis.host.host_age_bin)(analysis.host.host_age)) {
				return success(analysis);
			}
			return failure('host.host_age is non-null and that value is outside of the given age bin', {
				bin: analysis.host.host_age_bin,
				age: analysis.host.host_age,
			});
		case '90 - 99':
		//fallthrough
		case '100+':
			// with ages 90 and greater we need to make sure:
			// - host_age is null
			// - host_age_null_reason is restricted access
			// - host_age_bin is '90+'
			return success(
				Object.assign(_.cloneDeep(analysis), {
					host: { ...analysis.host, host_age: null, host_age_null_reason: 'Restricted Access', host_age_bin: '90+' },
				}),
			);
		default:
			return success(analysis);
	}
};

export default defineTransform({ start: { name: CS_NAME, version: 5 }, end: { name: CS_NAME, version: 6 } }, transform);
