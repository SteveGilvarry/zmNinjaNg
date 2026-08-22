/**
 * Zones API - backend dispatcher. See api/groups.ts for the pattern.
 */

import type { ApiClient } from './client';
import type { Zone } from './types';
import * as legacy from './legacy/zones';
import * as v3 from './v3/zones';

export function getZones(client: ApiClient, monitorId: string): Promise<Zone[]> {
  return client.backend === 'zmapi-v3'
    ? v3.getZones(client, monitorId)
    : legacy.getZones(client, monitorId);
}
