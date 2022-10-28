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

import { Queue } from './queue';

export type QueueEvent = {
	running: number;
	queued: number;
};

/**
 * A queue to manage async functions and limit how many of them run concurrently.
 * After the PromiseQueue is created, async functions can be added to it. Those functions will
 * be started immediately if possible, or queued if too many functions from this queue are currently active.
 * When a function in this queue returns, the next function stored in the queue will be started.
 *
 * Additionally, you can register actions to the queue to be called whenever a function is added to the queue,
 * whenever a new function starts, finishes, or throws an error.
 * Using the onError events, you can implement error handling for methods in teh queue.
 * If no error handlers are provided, any errors will be thrown.
 * @param maxConcurrency
 * @returns
 */
const PromiseQueue = (maxConcurrency: number) => {
	let activeProcesses = 0;
	const queue = Queue<() => Promise<void>>();

	const startActions: ((event: QueueEvent) => void)[] = [];
	const finishActions: ((event: QueueEvent) => void)[] = [];
	const errorActions: ((event: QueueEvent & { error: unknown }) => void)[] = [];

	const onAdd = (action: (event: QueueEvent) => void) => {
		queue.onAdd((event) => action({ queued: event.length, running: activeProcesses }));
	};
	const onStart = (action: (event: QueueEvent) => void) => {
		startActions.push(action);
	};
	const onFinish = (action: (event: QueueEvent) => void) => {
		finishActions.push(action);
	};
	const onError = (action: (event: QueueEvent) => void) => {
		errorActions.push(action);
	};

	const attemptStart = async () => {
		if (activeProcesses < maxConcurrency) {
			const next = queue.take();
			if (next.success) {
				activeProcesses++;
				startActions.forEach((action) => action({ queued: queue.getSize(), running: activeProcesses }));
				try {
					await next.data();
					activeProcesses--;
					finishActions.forEach((action) => action({ queued: queue.getSize(), running: activeProcesses }));
					attemptStart();
				} catch (error) {
					activeProcesses--;
					if (errorActions.length) {
						errorActions.forEach((action) => action({ queued: queue.getSize(), running: activeProcesses, error }));
						attemptStart();
					} else {
						throw error;
					}
				}
			}
		}
	};

	queue.onAdd(attemptStart);

	const add = (fn: () => Promise<any>) => {
		const queuedFn = async () => fn();
		queue.add(queuedFn);
	};

	return {
		add,
		getSize: () => queue.getSize(),
		getRunning: () => activeProcesses,
		onAdd,
		onStart,
		onFinish,
		onError,
	};
};
export default PromiseQueue;
export type PromiseQueue = ReturnType<typeof PromiseQueue>;
