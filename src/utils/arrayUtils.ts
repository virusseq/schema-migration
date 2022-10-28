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
import { Predicate, Result } from '../types';
import { failure, success } from '../types/result';

/**
 * Removes undefined elements from an array, correcting the array type in the process.
 * @param items
 * @returns
 */
export const filterUndefined = <T>(...items: (T | undefined)[]) => items.filter((i) => i !== undefined) as T[];

/**
 * Return a copy of an array that begins with the first element that matches the provided test
 * @param array
 * @param test
 * @returns
 */
export const sliceFrom = <T>(array: T[], test: Predicate<T>): Result<T[]> => {
	const sliceIndex = _.findIndex(array, test);
	if (sliceIndex < 0) {
		return failure(`Unable to find item in array that matches provided starting position test.`);
	}
	return success(array.slice(sliceIndex));
};

/**
 * Return a copy of provided array starting from the beginning, removing all elements beyond the first index that passes the provided text.
 * If the optional `inclusive` parameter is set to `true`, the first element that passes the test will be included in output
 * @param {T[]} array
 * @param test
 * @param {boolean} [inclusive=false] set to true to include first element that passes the test in the output
 * @returns {Result<T[]>} Result with sliced array
 */
export const sliceTo = <T>(array: T[], test: Predicate<T>, inclusive: boolean = false): Result<T[]> => {
	const sliceIndex = _.findIndex(array, test);
	if (sliceIndex < 0) {
		return failure(`Unable to find item in array that matches provided end position test.`);
	}
	return success(array.slice(0, sliceIndex + (inclusive ? 1 : 0)));
};

/**
 * Convenience method to map a function to every element of an array and then return a Promise.all of the array.
 * This makes it simple to map an array of items to an async method and await the result of every request.
 * @param fn
 * @returns
 */
export const mapAsync =
	<T, R>(fn: (_: T) => Promise<R>) =>
	(input: T[]) =>
		Promise.all(input.map(fn));
