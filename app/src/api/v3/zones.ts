/**
 * Zones API - v3 (zm-api) implementation.
 */

import type { ApiClient } from '../client';
import type { Zone } from '../types';
import { PaginatedZonesResponseSchema } from './types';
import { mapZone } from './mappers';

export async function getZones(client: ApiClient, monitorId: string): Promise<Zone[]> {
  const response = await client.get(`/api/v3/monitors/${monitorId}/zones`, {
    intent: `Fetch zones for monitor ${monitorId}`,
    params: { page: 1, page_size: 200 },
  });
  const page = PaginatedZonesResponseSchema.parse(response.data);
  return page.items.map(mapZone);
}
