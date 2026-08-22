/**
 * Logs API - backend dispatcher. See api/groups.ts for the pattern.
 *
 * getZMLogLevel and getUniqueZMComponents are pure functions over an already
 * fetched log list, so both backends share the legacy implementation.
 */

import type { ApiClient } from './client';
import type { ZMLogsResponse } from './types';
import * as legacy from './legacy/logs';
import * as v3 from './v3/logs';

export type { ZMLogFilters } from './legacy/logs';
import type { ZMLogFilters } from './legacy/logs';

export function getZMLogs(client: ApiClient, filters: ZMLogFilters = {}): Promise<ZMLogsResponse> {
  return client.backend === 'zmapi-v3'
    ? v3.getZMLogs(client, filters)
    : legacy.getZMLogs(client, filters);
}

export const getZMLogLevel = legacy.getZMLogLevel;
export const getUniqueZMComponents = legacy.getUniqueZMComponents;
