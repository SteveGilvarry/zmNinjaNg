/**
 * Logs API - v3 (zm-api) implementation.
 */

import type { ApiClient } from '../client';
import type { ZMLogsResponse } from '../types';
import type { ZMLogFilters } from '../legacy/logs';
import { PaginatedLogsResponseSchema } from './types';
import { mapLog } from './mappers';

export async function getZMLogs(client: ApiClient, filters: ZMLogFilters = {}): Promise<ZMLogsResponse> {
  const params: Record<string, string | number> = {
    page: filters.page || 1,
    page_size: filters.limit || 100,
  };
  if (filters.component) params.component = filters.component;
  if (filters.level !== undefined) params.level = filters.level;

  const response = await client.get('/api/v3/logs', { params, intent: 'Fetch server logs' });
  const page = PaginatedLogsResponseSchema.parse(response.data);

  return {
    logs: page.items.map((l) => ({ Log: mapLog(l) })),
    pagination: {
      page: page.current_page,
      current: page.current_page,
      count: page.total,
      prevPage: page.current_page > 1,
      nextPage: page.current_page < page.last_page,
      pageCount: page.last_page,
      limit: page.per_page,
    },
  };
}
