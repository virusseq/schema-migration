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

import jwt from 'jsonwebtoken';
import { Headers } from 'node-fetch';
import urlJoin from 'url-join';
import { z as zod } from 'zod';

import Logger from '../../logger';
import { Result } from '../../types';
import { FetchParams, safeFetch, safeJsonFetcher, safeTextFetcher, urlEncodeForm } from '../../utils/fetchUtils';
import { failure, success } from '../../types/result';
import { asyncPipe } from '../../structures/pipe';
import { filterUndefined } from '../../utils/arrayUtils';
import limitConcurrency from '../../structures/limitConcurrency';

export type EgoConfigOptions = {
	host: string;
	name?: string;
	appCredentials?: {
		id: string;
		secret: string;
	};
};

/**
 * Create a new Ego client to interact with the Ego API, validate incoming JWT and API Key tokens,
 * and make outgoing requests with Authorization header provided through applicaiton credentials
 * @param config
 * @returns
 */
function createEgoClient(config: EgoConfigOptions) {
	/* ===== Closure scoped properties ===== */
	const logger = Logger(...filterUndefined('EgoClient', config.name));
	let publicKey: string;
	let token: string;
	logger.debug('creating ego client');
	/* ===== Public Key Fetchering ===== */
	const fetchPublicKey = async (): Promise<Result<string>> => {
		logger.info('Fetching Ego Public Key...');
		const publicKeyUrl = urlJoin(config.host, 'oauth/token/public_key');

		return await safeTextFetcher(publicKeyUrl)();
	};

	/**
	 * Return public key from ego server.
	 * @returns
	 */
	const getPublicKey = async (): Promise<Result<string>> => {
		// If we have a public key, return it. Once it we get a public key, thats the only one we'll ever use. Restart application is needed to fetch a new key.
		if (publicKey) {
			return success(publicKey);
		}

		const fetchResult = await fetchPublicKey();
		if (!fetchResult.success) {
			return failure('Failed to fetch public key', ...fetchResult.errors);
		}
		// Update stored public key
		publicKey = fetchResult.data;
		return success(publicKey);
	};

	/* ===== Client JWT Fetchering ===== */
	/**
	 * Reach out to Ego to return JWT for application credentials
	 * @returns
	 */
	const fetchClientToken = async (): Promise<Result<string>> => {
		logger.info('Fetching Ego Application Token using client credentials...');

		// Schema for Expected Response
		// TODO: Add in all types in response with working type validation
		const ApplicationJwtResponse = zod.object({
			access_token: zod.string(),
			// scope - unused, but expected in response. can ignore
			// token_type - unused, but expected in response. can ignore
			// expires_in - unused, but expected in response. can ignore
		});

		// URL For Request
		const clientTokenUrl = urlJoin(
			config.host,
			`oauth/token`,

			'?' + new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
		);

		// Form data for Request
		const body = urlEncodeForm({
			client_id: config.appCredentials?.id,
			client_secret: config.appCredentials?.secret,
		});

		// Fetch Pipeline
		const fetchPipeline = asyncPipe(
			safeJsonFetcher(clientTokenUrl, {
				method: 'POST',
				body,
				headers: new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' }),
			}),
		)
			.into(ApplicationJwtResponse.parse)
			.into((clientTokenResponse) => clientTokenResponse.access_token)
			.build();

		return await fetchPipeline();
	};

	/**
	 * Return stored client token if valid, otherwise fetch a new JWT from ego
	 * TODO: It would be smart to limit this to only have one request in flight at a time. If requested a second time before first can finish fetching token, the second request waits for the first to finish
	 */
	const getClientToken = async (): Promise<Result<string>> => {
		if (!config.appCredentials) {
			return failure('Cannot retrieve JWT, no application credentials provided.');
		}

		const publicKeyResult = await getPublicKey();
		if (!publicKeyResult.success) {
			return failure(
				'Unable to retrieve client token, failed to get public key to validate tokens with',
				...publicKeyResult.errors,
			);
		}

		try {
			// jwt.verify throws error if token is invalid
			if (token && jwt.verify(token, publicKeyResult.data)) {
				// Return existing, valid token
				return success(token);
			}
		} catch (e) {
			if (token) {
				logger.debug(`JWT has expired`, e);
			}
			// Continue, we'll go fetch another.
		}

		// fetch new token
		const fetchResult = await fetchClientToken();
		if (!fetchResult.success) {
			// fetch failure
			return failure('Failure fetching new client token', ...fetchResult.errors);
		}

		// update token and return it
		token = fetchResult.data;
		return success(token);
	};

	const limitedGetToken = limitConcurrency(1, getClientToken);
	const limitedGetPublicKey = limitConcurrency(1, getPublicKey);

	const fetchWithAuth = async (...args: FetchParams) => {
		const tokenResult = await limitedGetToken(undefined);
		if (!tokenResult.success) {
			return failure('Cannot execute request with auth, failed to get application JWT', ...tokenResult.errors);
		}

		const requestInit = args[1] || {};
		const headers = new Headers(requestInit.headers);
		headers.set('Authorization', `Bearer ${tokenResult.data}`);
		requestInit.headers = headers;

		return safeFetch(args[0], requestInit);
	};

	/* ===== Return Ego Client ===== */
	return {
		fetchWithAuth,
		getClientToken: (_: void) => limitedGetToken(undefined),
		getPublicKey: (_: void) => limitedGetPublicKey(undefined),
	};
}

export type EgoClient = ReturnType<typeof createEgoClient>;

export default createEgoClient;
