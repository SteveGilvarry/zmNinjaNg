/**
 * Groups API - backend dispatcher.
 *
 * Forwards to the legacy (CakePHP) or v3 (zm-api) implementation based on the
 * backend the caller's client is bound to. Every api/*.ts module in this
 * directory follows the same shape: the client carries its backend, so callers
 * never choose an implementation themselves.
 */

import type { ApiClient } from './client';
import type { GroupsResponse } from './types';
import * as legacy from './legacy/groups';
import * as v3 from './v3/groups';

export function getGroups(client: ApiClient): Promise<GroupsResponse> {
  return client.backend === 'zmapi-v3' ? v3.getGroups(client) : legacy.getGroups(client);
}
