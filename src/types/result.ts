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

import { unknownToString } from '../utils/typeUtils';

type Result<T> = { success: true; data: T } | { success: false; errors: string[] };
export default Result;

/**
 * Creates a successful Result object with the provided data
 * @param data
 * @returns
 */
export const success = <T>(data: T): Result<T> => ({ success: true, data });

/**
 * Creates an unsuccessful Result object with the provided error messages
 * @param {string[]} errors
 * @returns {Result}
 */
export const failure = (...errors: (string | number | boolean | object | unknown)[]): Result<any> => ({
	success: false,
	errors: errors.map(unknownToString),
});

/**
 * Accept a result or value and return it as a result
 * @param input
 * @returns
 */
export const asResult = <T>(input: Result<T> | T): Result<T> =>
	input && typeof input === 'object' && 'success' in input && typeof input.success === 'boolean'
		? input
		: success(input as T);

/**
 * Modify another function to accept a Result as input and gaurantee a result as output. All thrown errors
 * from the original method will be captured as failure results.
 * @param fn
 * @returns
 */
export const withResult = <T, S>(fn: (_: T) => Result<S> | S): ((_: Result<T> | T) => Result<S>) => {
	return (input: Result<T> | T): Result<S> => {
		const result = asResult(input);
		if (!result.success) {
			return failure(...result.errors);
		}

		try {
			return asResult(fn(result.data));
		} catch (e) {
			return failure(e);
		}
	};
};

/**
 * Modify another async function to accept a Result as input, and gaurantee the promise returns a result as output. Errors
 * thrown in the Promise are converted to a failure Result with the error as a message.
 * @param fn
 * @returns
 */
export const withResultAsync = <T, S>(
	fn: (_: T) => Promise<Result<S> | S>,
): ((_: Result<T> | T) => Promise<Result<S>>) => {
	return async (input: Result<T> | T): Promise<Result<S>> => {
		const inputResult = asResult(input);
		if (!inputResult.success) {
			return Promise.resolve(failure(...inputResult.errors));
		}

		try {
			const promiseResult = await fn(inputResult.data);
			return Promise.resolve(asResult(promiseResult));
		} catch (e) {
			return Promise.resolve(failure(e));
		}
	};
};
