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
import { Analysis, AnalysisType } from '../external/song/types';
import { Result } from '../types';
import { sliceFrom, sliceTo } from '../utils/arrayUtils';
import { asResult, failure, success, withResult } from '../types/result';

export const defineTransform = (
	versions: { start: AnalysisType; end: AnalysisType },
	transformer: (input: Analysis) => Result<Analysis>,
) => {
	const { start, end } = versions;
	const apply = (input: Analysis): Result<Analysis> => {
		if (!_.isEqual(input.analysisType, start)) {
			return failure('Analysis type does not match expected input type');
		}
		const transformResult = transformer(input);
		if (!transformResult.success) {
			return failure(`Error applying transform`, versions, transformResult);
		}
		return success({
			...transformResult.data,
			analysisType: end,
		});
	};

	return { start, end, apply };
};
export type Transform = ReturnType<typeof defineTransform>;

export type TransformChain = {
	getStart: () => AnalysisType;
	getEnd: () => AnalysisType;

	add: (transform: Transform) => Result<TransformChain>; // Warning: Will throw an error if you add a transform that doesnt connect

	from: (version: AnalysisType) => Result<TransformChain>;
	to: (version: AnalysisType) => Result<TransformChain>;

	apply: (analysis: Analysis) => Result<Analysis>;
};

const extendTransformChain =
	(baseChain: Transform[] = []) =>
	(...transforms: Transform[]): Result<TransformChain> => {
		const chain: Transform[] = [...baseChain];

		// Try/Catch on this for each so we can break out of it by throwing an error if the chain breaks.
		try {
			transforms.forEach((transform, index) => {
				const end = chain.length > 0 ? chain.slice(-1)[0].end : transform.start;
				if (!_.isEqual(end, transform.start)) {
					const error = `Transform provided at index ${index} does not connect to the transform chain. Received: ${JSON.stringify(
						transform.end,
					)} - Expected: ${JSON.stringify(end)}`;

					throw error;
				}

				chain.push(transform);
			});
		} catch (e) {
			return failure(e);
		}

		const getStart = () => chain[0].start;
		const getEnd = () => chain.slice(-1)[0].end;

		const from = (version: AnalysisType): Result<TransformChain> => {
			const slicedChainResult = sliceFrom(chain, (transform) => _.isEqual(transform.start, version));
			if (!slicedChainResult.success) {
				return failure(
					'Migration chain does not have a transform to start from for analyses of this type',
					version,
					...slicedChainResult.errors,
				);
			}
			return extendTransformChain(slicedChainResult.data)();
		};

		const to = (version: AnalysisType): Result<TransformChain> => {
			const slicedChainResult = sliceTo(chain, (transform) => _.isEqual(transform.end, version), true);
			if (!slicedChainResult.success) {
				return failure(
					'Migration chain does not have a transform to end on for analyses of this type',
					version,
					...slicedChainResult.errors,
				);
			}
			return extendTransformChain(slicedChainResult.data)();
		};

		const apply = (analysis: Analysis): Result<Analysis> =>
			chain.reduce((acc, transform) => withResult(transform.apply)(acc), asResult(_.cloneDeep(analysis)));

		return asResult({
			getStart,
			getEnd,
			add: (transform: Transform) => extendTransformChain(chain)(transform),
			from,
			to,
			apply,
		});
	};

export const createTransformChain = extendTransformChain([]);
