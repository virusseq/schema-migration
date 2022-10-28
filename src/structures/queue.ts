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
import { failure, success } from '../types/result';

export type QueueEvent<T> = {
	length: number;
	item: T;
};
export type QueueAction<T> = (event: QueueEvent<T>) => void;

export type Queue<T> = {
	add: (item: T) => void;
	take: () => Result<T>;
	onAdd: (action: QueueAction<T>) => void;
	onTake: (action: QueueAction<T>) => void;
	getSize: () => number;
};

/**
 * Simple queue implementation with triggered eventz when items are added or removed
 * Note: not optimized in anyway. This should be logically correct but may not be maximally efficient.
 * @returns
 */
export const Queue = <T>(): Queue<T> => {
	// TODO: actually used a properly implemented queue not an array
	const queue: T[] = [];

	const addActions: QueueAction<T>[] = [];
	const takeActions: QueueAction<T>[] = [];

	const triggerAddActions = (item: T) => {
		addActions.forEach((action) => action({ length: queue.length, item }));
	};
	const triggerTakeActions = (item: T) => {
		takeActions.forEach((action) => action({ length: queue.length, item }));
	};

	const add = (item: T) => {
		queue.push(item);
		triggerAddActions(item);
	};
	const take = () => {
		const item = queue.shift();
		if (item) {
			triggerTakeActions(item);
			return success(item);
		}
		return failure('Empty Queue');
	};

	const onAdd = (action: QueueAction<T>) => {
		addActions.push(action);
	};
	const onTake = (action: QueueAction<T>) => {
		takeActions.push(action);
	};

	return {
		add,
		take,

		onAdd,
		onTake,

		getSize: () => queue.length,
	};
};
