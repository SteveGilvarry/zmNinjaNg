/**
 * Server API - backend dispatcher. See api/groups.ts for the pattern.
 *
 * The Server/Storage/ServerLoad/DiskUsage shapes are defined by the legacy
 * implementation and re-exported here; the v3 mappers produce the same shapes
 * so the rest of the app stays backend-agnostic.
 */

import type { ApiClient } from './client';
import type { Config } from './types';
import * as legacy from './legacy/server';
import * as v3 from './v3/server';

export type { Server, ServersResponse, Storage, ServerLoad, DiskUsage } from './legacy/server';
import type { Server, Storage, ServerLoad, DiskUsage } from './legacy/server';

export function getServers(client: ApiClient): Promise<Server[]> {
  return client.backend === 'zmapi-v3' ? v3.getServers(client) : legacy.getServers(client);
}

export function getStorages(client: ApiClient): Promise<Storage[]> {
  return client.backend === 'zmapi-v3' ? v3.getStorages(client) : legacy.getStorages(client);
}

export function getDaemonCheck(client: ApiClient, apiBaseUrl?: string): Promise<boolean> {
  return client.backend === 'zmapi-v3'
    ? v3.getDaemonCheck(client, apiBaseUrl)
    : legacy.getDaemonCheck(client, apiBaseUrl);
}

export function getLoad(client: ApiClient, apiBaseUrl?: string): Promise<ServerLoad> {
  return client.backend === 'zmapi-v3'
    ? v3.getLoad(client, apiBaseUrl)
    : legacy.getLoad(client, apiBaseUrl);
}

export function getDiskPercent(client: ApiClient, apiBaseUrl?: string): Promise<DiskUsage> {
  return client.backend === 'zmapi-v3'
    ? v3.getDiskPercent(client, apiBaseUrl)
    : legacy.getDiskPercent(client, apiBaseUrl);
}

export function getConfigs(client: ApiClient): Promise<Config[]> {
  return client.backend === 'zmapi-v3' ? v3.getConfigs(client) : legacy.getConfigs(client);
}

/**
 * Multi-port ZMS streaming is a legacy-only concept - v3 streams from its own
 * /api/v3/live endpoints - so the v3 implementation always answers null.
 */
export function fetchMinStreamingPort(client: ApiClient): Promise<number | null> {
  return client.backend === 'zmapi-v3'
    ? v3.fetchMinStreamingPort(client)
    : legacy.fetchMinStreamingPort(client);
}
