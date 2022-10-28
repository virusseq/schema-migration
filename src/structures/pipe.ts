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

import { Result } from '../types';
import { failure, withResult, withResultAsync } from '../types/result';

type PipeStep<A, B> = (a: A) => Result<B> | B;
type AsyncPipeStep<A, B> = (a: A) => Promise<Result<B> | B>;

type Pipe<A, B> = (a: A) => Result<B>;
type AsyncPipe<A, B> = (a: A) => Promise<Result<B>>;

type PipeBuilder<A, B> = {
	run: (_: A) => Result<B>;
	build: () => Pipe<A, B>;
	into: <C>(step: PipeStep<B, C>) => PipeBuilder<A, C>;
	await: <C>(step: AsyncPipeStep<B, C>) => AsyncPipeBuilder<A, C>;
	check: (step: (b: B) => boolean, error: string) => PipeBuilder<A, B>;
};
type AsyncPipeBuilder<A, B> = {
	run: (_: A) => Promise<Result<B>>;
	build: () => AsyncPipe<A, B>;
	into: <C>(step: PipeStep<B, C>) => AsyncPipeBuilder<A, C>;
	await: <C>(step: AsyncPipeStep<B, C>) => AsyncPipeBuilder<A, C>;
	check: (step: (b: B) => boolean, error: string) => AsyncPipeBuilder<A, B>;
};

export const asyncPipe = <A, B>(f: AsyncPipeStep<A, B>): AsyncPipeBuilder<A, B> => {
	const safeF = withResultAsync(f);
	return {
		run: async (arg: A) => await safeF(arg),
		build: () => safeF,
		into: function <C>(g: PipeStep<B, C>): AsyncPipeBuilder<A, C> {
			const safeG = withResult(g);
			return asyncPipe(async (arg: A) => {
				const fResult = await safeF(arg);
				return safeG(fResult);
			});
		},
		await: function <C>(g: AsyncPipeStep<B, C>) {
			const safeG = withResultAsync(g);
			return asyncPipe(async (arg: A) => {
				const fResult = await safeF(arg);
				return safeG(fResult);
			});
		},
		check: function (g: (x: B) => boolean, error: string) {
			return asyncPipe(async (arg: A) => {
				const fResult = await safeF(arg);
				if (fResult.success && !g(fResult.data)) {
					return failure(error);
				}
				return fResult;
			});
		},
	};
};

export const pipe = <A, B>(f: PipeStep<A, B>): PipeBuilder<A, B> => {
	const safeF = withResult(f);
	return {
		run: (arg: A) => safeF(arg),
		build: () => safeF,
		into: function <C>(g: PipeStep<B, C>) {
			const safeG = withResult(g);
			return pipe((arg: A) => safeG(safeF(arg)));
		},
		await: function <C>(g: AsyncPipeStep<B, C>) {
			const safeG = withResultAsync(g);
			return asyncPipe(async (arg: A) => {
				const fResult = await safeF(arg);
				return safeG(fResult);
			});
		},
		check: function (g: (x: B) => boolean, error: string) {
			return pipe((arg: A) => {
				const fResult = safeF(arg);
				if (fResult.success && !g(fResult.data)) {
					return failure(error);
				}
				return fResult;
			});
		},
	};
};
