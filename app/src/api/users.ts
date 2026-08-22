/**
 * Users API - backend dispatcher. See api/groups.ts for the pattern.
 *
 * The one call here answers "what may the logged-in account do", and the two
 * backends answer it very differently.
 *
 * Legacy has no endpoint for it. It reads the user list and finds its own row,
 * and CakePHP gates that list on `System() != 'None'` - so an account without
 * system access is refused, and the refusal itself is the only column the app
 * can infer. The other five stay unknown.
 *
 * v3 serves `GET /api/v3/me` behind plain authentication, so every account
 * reads its own row and every column is known. The verdict helpers in
 * lib/permissions/zm-permissions.ts already distinguish "denied" from
 * "unknown", so the extra certainty needs nothing new downstream - surfaces
 * that stayed optimistic on legacy simply become accurate on v3.
 */

import type { ApiClient } from './client';
import type { ZmPermissions } from '../lib/permissions/zm-permissions';
import { fetchAccountPermissionsLegacy } from './legacy/users';
import { fetchAccountPermissionsV3 } from './v3/users';

/**
 * Permissions for the account a profile logs in as.
 *
 * @param client - API client for the target profile
 * @param username - The profile's username; absent means the server has
 *   authentication turned off, where ZoneMinder allows everything
 * @returns The account's columns, or `undefined` when the backend could not
 *   report them. Transport failures reject so the caller can retry.
 */
export function fetchAccountPermissions(
  client: ApiClient,
  username: string | undefined,
): Promise<ZmPermissions | undefined> {
  return client.backend === 'zmapi-v3'
    ? fetchAccountPermissionsV3(client, username)
    : fetchAccountPermissionsLegacy(client, username);
}
