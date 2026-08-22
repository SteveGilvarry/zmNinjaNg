/**
 * Auth API - backend dispatcher. See api/groups.ts for the pattern.
 *
 * The two backends authenticate differently: legacy posts form-encoded
 * credentials to /host/login.json and carries the token as a query param, while
 * v3 posts JSON to /api/v3/auth/login and carries a JWT Bearer header. Both are
 * mapped onto the same LoginResponse shape so stores/auth.ts stays
 * backend-agnostic.
 *
 * fetchZmsPath and fetchGo2RTCPath read legacy server config for the ZMS and
 * go2rtc streaming stacks. v3 has neither, so they stay legacy-only; the v3
 * bootstrap never calls them.
 */

import type { ApiClient } from './client';
import type { LoginResponse, VersionResponse } from './types';
import * as legacy from './legacy/auth';
import * as v3 from './v3/auth';

export type { LoginCredentials, LoginWithRefreshToken } from './legacy/auth';
import type { LoginCredentials } from './legacy/auth';

export function login(client: ApiClient, credentials: LoginCredentials): Promise<LoginResponse> {
  return client.backend === 'zmapi-v3'
    ? v3.loginV3(credentials, client)
    : legacy.login(client, credentials);
}

export function refreshToken(client: ApiClient, token: string): Promise<LoginResponse> {
  return client.backend === 'zmapi-v3'
    ? v3.refreshTokenV3(token, client)
    : legacy.refreshToken(client, token);
}

export function getVersion(client: ApiClient): Promise<VersionResponse> {
  return client.backend === 'zmapi-v3' ? v3.getVersionV3(client) : legacy.getVersion(client);
}

/**
 * Reachability check against a base URL. Each backend probes the cheapest
 * endpoint it is guaranteed to serve.
 */
export function testConnection(client: ApiClient, apiUrl: string): Promise<boolean> {
  return client.backend === 'zmapi-v3'
    ? v3.testConnectionV3(client, apiUrl)
    : legacy.testConnection(client, apiUrl);
}

export const fetchZmsPath = legacy.fetchZmsPath;
export const fetchGo2RTCPath = legacy.fetchGo2RTCPath;
