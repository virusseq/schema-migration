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

import fetch, { Response } from 'node-fetch';
import AbortController from 'abort-controller';

import { Result } from '../types';

import { asyncPipe } from '../structures/pipe';
import { failure, success } from '../types/result';

export type FetchParams = Parameters<typeof fetch>;

/**
 * Perform an http request and wrap the outcome in a Result.
 * If the request throws an error, instead that error is caught an a failure Result is returned
 * with the returned error message.
 *
 * Warning: This method should not always be used. If you expect meaningful data in a response with a
 *          non-2xx http resoponse then perform the request without this method and handle the response
 *          directly.
 * @param args same list of arguments as the node-fetch `fetch` method
 * @returns
 */
export const safeFetch = async (...args: FetchParams): Promise<Result<Response>> => {
	try {
		const response = await fetch(...args);
		return success(response);
	} catch (e: unknown) {
		return failure(e);
	}
};

/**
 * Utility method to check if a request returned ok and then return
 * the response body as a json in a Result object.
 * @param response
 * @returns
 */
export const getResponseJson = async (response: Response): Promise<Result<unknown>> => {
	if (response.ok) {
		const body = await response.json();
		return success(body);
	} else {
		return failure(`Fetch response was not OK! Status: ${response.status} - ${await response.text()}`);
	}
};

/**
 * Utility method to check if a request returned ok and then return
 * the response body as a string in a Result object.
 * @param response
 * @returns
 */
export const getResponseText = async (response: Response): Promise<Result<string>> => {
	if (response.ok) {
		const body = await response.text();
		return success(body);
	} else {
		return failure(`Fetch response was not OK! Status: ${response.status} - ${await response.text()}`);
	}
};

/**
 * Make fetch request and return body as JSON if possible.
 * @returns {Result<unknown>} Result with response body parse as JSON or any caught errors
 */
export const safeJsonFetcher = (...args: FetchParams) => {
	return asyncPipe((_: void) => fetch(...args))
		.await(getResponseJson)
		.build();
};

/**
 * Make fetch request and return body as Text if possible.
 * @returns {Result<string>} Result with response body parse as JSON or any caught errors
 */
export const safeTextFetcher = (...args: FetchParams) =>
	asyncPipe((_: void) => fetch(...args))
		.await(getResponseText)
		.build();

/**
 * Convert a simple Record object into a URL Encoded form that can be passed to an http request
 * @param content
 * @returns
 */
export const urlEncodeForm = <T extends Record<string, any>>(content: T): string => {
	const formBody: string[] = [];
	Object.entries(content).forEach(([key, value]) => {
		formBody.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
	});
	return formBody.join('&');
};

/**
 * Modify a fetch request function to abort the request after a timeout period.
 * If the request does not resolve after the timeout duration, then it will abandon the request
 * and return with a message like `Request aborted by user`.
 *
 * Note: Without using this, a node-fetch request could possible stall indefinitely. It's possible that
 *       no request should be made without applying a timeout, but that's left for the implementer.
 * @param timeout
 * @param fn
 * @returns
 */
export const withTimeout =
	<R>(timeout: number, fn: (...args: FetchParams) => R) =>
	(...args: FetchParams): R => {
		const url = args[0];
		const init = args[1] || {};

		const controller = new AbortController();
		const timeoutReference = setTimeout(() => {
			controller.abort();
		}, timeout);

		init.signal = controller.signal;

		return fn(url, init);
	};
