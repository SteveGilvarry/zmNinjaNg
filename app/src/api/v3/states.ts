/**
 * States API - v3 (zm-api) implementation.
 */

import type { ApiClient } from '../client';
import type { State } from '../types';
import { PaginatedStatesResponseSchema } from './types';
import { mapState } from './mappers';
import { log, LogLevel } from '../../lib/logger';

export async function getStates(client: ApiClient): Promise<State[]> {
  const response = await client.get('/api/v3/states', {
    intent: 'Fetch system states',
    params: { page: 1, page_size: 200 },
  });
  const page = PaginatedStatesResponseSchema.parse(response.data);
  return page.items.map(mapState);
}

export async function changeState(client: ApiClient, stateName: string): Promise<void> {
  log.api('Changing system state (v3)', LogLevel.INFO, { stateName });
  await client.post(`/api/v3/states/change/${encodeURIComponent(stateName)}`);
}
