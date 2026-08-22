/**
 * Time API - backend dispatcher. See api/groups.ts for the pattern.
 */

import type { ApiClient } from './client';
import * as legacy from './legacy/time';
import * as v3 from './v3/time';

export function getServerTimeZone(client: ApiClient, token?: string): Promise<string> {
  return client.backend === 'zmapi-v3'
    ? v3.getServerTimeZone(client, token)
    : legacy.getServerTimeZone(client, token);
}
