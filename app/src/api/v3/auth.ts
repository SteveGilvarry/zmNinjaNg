/**
 * v3 (zm-api) authentication.
 *
 * Maps the v3 JWT endpoints onto the app's existing LoginResponse/VersionResponse
 * shapes so stores/auth.ts and the rest of the app stay backend-agnostic.
 *
 *  - login   : POST /api/v3/auth/login   { username, password } -> TokenResponse
 *  - refresh : POST /api/v3/auth/refresh { token }              -> TokenResponse
 *  - version : GET  /api/v3/host/getVersion                     -> V3VersionResponse
 */

import type { ApiClient } from '../client';
import type { LoginCredentials } from '../legacy/auth';
import type { LoginResponse, VersionResponse } from '../types';
import { log, LogLevel } from '../../lib/logger';
import { V3_HEALTH_CHECK_PATH } from '../../lib/zm/zm-constants';
import {
  TokenResponseSchema,
  V3VersionResponseSchema,
  type TokenResponse,
} from './types';

/**
 * v3 refresh tokens expire server-side after this many seconds (per the API
 * config). The token response does not echo it, so we track it client-side to
 * drive the existing refresh-leeway logic in stores/auth.ts.
 */
const V3_REFRESH_TOKEN_EXPIRES_SECS = 3600;

const V3_AUTH_PREFIX = '/api/v3/auth';
const V3_HOST_PREFIX = '/api/v3/host';

function tokenToLoginResponse(t: TokenResponse): LoginResponse {
  return {
    access_token: t.access_token,
    access_token_expires: t.expire_in,
    refresh_token: t.refresh_token,
    refresh_token_expires: V3_REFRESH_TOKEN_EXPIRES_SECS,
  };
}

export async function loginV3(
  credentials: LoginCredentials,
  client: ApiClient,
): Promise<LoginResponse> {
  log.auth('v3 login attempt', LogLevel.INFO, { username: credentials.user });
  const response = await client.post<TokenResponse>(`${V3_AUTH_PREFIX}/login`, {
    username: credentials.user,
    password: credentials.pass,
  });
  const token = TokenResponseSchema.parse(response.data);
  const login = tokenToLoginResponse(token);

  // Legacy's login response carries the server version; v3's does not, so fetch
  // it here and fill the same fields. This keeps the auth store's one path for
  // recording version working for both backends. Display-only, so a failure
  // must not fail the login.
  //
  // The token has to be passed explicitly: the store records it only once this
  // function returns, so an ordinary request would read "not authenticated",
  // trigger the client's proactive-login path, and dedup onto the very login
  // waiting here - deadlocking until the bootstrap timeout.
  try {
    const version = await getVersionV3(client, token.access_token);
    login.version = version.version;
    login.apiversion = version.apiversion;
  } catch (error) {
    log.auth('v3 version fetch failed after login; version stays unknown', LogLevel.DEBUG, { error });
  }

  return login;
}

export async function refreshTokenV3(
  refreshToken: string,
  client: ApiClient,
): Promise<LoginResponse> {
  const response = await client.post<TokenResponse>(`${V3_AUTH_PREFIX}/refresh`, {
    token: refreshToken,
  });
  const token = TokenResponseSchema.parse(response.data);
  return tokenToLoginResponse(token);
}

/**
 * @param token - The access token to use, for callers that hold one the auth
 *   store does not know about yet. Only the login flow needs this; see the
 *   note in loginV3.
 */
export async function getVersionV3(
  client: ApiClient,
  token?: string,
): Promise<VersionResponse> {
  const config = token
    ? { headers: { 'Skip-Auth': 'true', Authorization: `Bearer ${token}` } }
    : {};
  const response = await client.get(`${V3_HOST_PREFIX}/getVersion`, config);
  const v = V3VersionResponseSchema.parse(response.data);
  return { version: v.version, apiversion: v.api_version };
}

/**
 * Reachability check for a v3 server. health_check is unauthenticated, so this
 * works before any login - the same role /host/getVersion.json plays for legacy.
 */
export async function testConnectionV3(client: ApiClient, apiUrl: string): Promise<boolean> {
  try {
    await client.get(V3_HEALTH_CHECK_PATH, {
      baseURL: apiUrl,
      intent: 'Test v3 connection',
      headers: { 'Skip-Auth': 'true' },
    });
    return true;
  } catch (error) {
    log.auth('v3 connection test failed', LogLevel.WARN, { apiUrl, error });
    return false;
  }
}
