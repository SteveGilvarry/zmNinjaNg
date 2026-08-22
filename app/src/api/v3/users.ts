/**
 * Account permissions - v3 (zm-api) implementation.
 *
 * v3 has the endpoint legacy lacks. `GET /api/v3/me` returns the caller's own
 * Users row, and it sits behind plain authentication rather than the System
 * feature gate, so any authenticated account can read it. Two things follow
 * that the CakePHP path cannot manage:
 *
 *  - Every column is known. Legacy reads the user list, which CakePHP gates on
 *    `System() != 'None'`, so an operator account gets a 401 and the app can
 *    only infer `System: 'None'` while `Monitors`, `Stream` and the rest stay
 *    unknown. `System='None'` with `Monitors='Edit'` is a legal account, and
 *    this reports it correctly.
 *  - No row matching. The token decides whose row comes back, so a profile
 *    whose stored username has drifted from the account still gets its own
 *    permissions instead of none.
 *
 * A refusal here therefore means the session is broken, not that the account
 * lacks system access, so it propagates rather than being read as a denial.
 */

import type { ApiClient } from '../client';
import { MeResponseSchema } from './types';
import {
  parsePermissionLevel,
  UNRESTRICTED_PERMISSIONS,
  type ZmPermissions,
} from '../../lib/permissions/zm-permissions';
import { log, LogLevel } from '../../lib/logger';
import { V3_API_PREFIX } from '../../lib/zm/zm-constants';

/**
 * Permissions for the account a v3 profile logs in as.
 *
 * @param client - API client for the target profile
 * @param username - The profile's username; absent means the server has
 *   authentication turned off, where every action is allowed
 * @returns The account's columns. Transport and auth failures reject so the
 *   caller can retry rather than gate the UI on a guess.
 */
export async function fetchAccountPermissionsV3(
  client: ApiClient,
  username: string | undefined,
): Promise<ZmPermissions> {
  if (!username) return UNRESTRICTED_PERMISSIONS;

  const response = await client.get(`${V3_API_PREFIX}/me`, {
    intent: 'Read account permissions',
  });
  const { user } = MeResponseSchema.parse(response.data);

  log.api('Account permissions read from v3', LogLevel.DEBUG, { username: user.username });

  return {
    system: parsePermissionLevel(user.system),
    monitors: parsePermissionLevel(user.monitors),
    stream: parsePermissionLevel(user.stream),
    events: parsePermissionLevel(user.events),
    control: parsePermissionLevel(user.control),
    groups: parsePermissionLevel(user.groups),
  };
}
