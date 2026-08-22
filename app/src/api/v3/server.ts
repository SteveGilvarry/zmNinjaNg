/**
 * Server API - v3 (zm-api) implementation.
 *
 * Load, disk usage and memory come from /api/v3/system/status (stats block).
 * Configs/storage/servers map their paginated /api/v3 endpoints to the legacy
 * shapes. Multi-port ZMS streaming is a legacy-only concept and stays null.
 */

import type { ApiClient } from '../client';
import type { Config } from '../types';
import type { Server, Storage, ServerLoad, DiskUsage } from '../legacy/server';
import {
  SystemStatusResponseSchema,
  PaginatedConfigsResponseSchema,
  PaginatedStorageResponseSchema,
  PaginatedServersResponseSchema,
} from './types';
import { mapConfig, mapStorage, mapServer } from './mappers';
import { V3_HEALTH_CHECK_PATH } from '../../lib/zm/zm-constants';

async function getSystemStats(client: ApiClient) {
  const response = await client.get('/api/v3/system/status', {
    intent: 'Fetch system status',
  });
  return SystemStatusResponseSchema.parse(response.data).stats ?? {};
}

export async function getServers(client: ApiClient): Promise<Server[]> {
  const response = await client.get('/api/v3/servers', {
    params: { page: 1, page_size: 100 },
    intent: 'Fetch servers',
  });
  const page = PaginatedServersResponseSchema.parse(response.data);
  return page.items.map(mapServer);
}

export async function getStorages(client: ApiClient): Promise<Storage[]> {
  const response = await client.get('/api/v3/storage', {
    params: { page: 1, page_size: 100 },
    intent: 'Fetch storage',
  });
  const page = PaginatedStorageResponseSchema.parse(response.data);
  return page.items.map(mapStorage);
}

export async function getDaemonCheck(client: ApiClient, _apiBaseUrl?: string): Promise<boolean> {
  try {
    await client.get(V3_HEALTH_CHECK_PATH, {
      intent: 'Server health check',
      headers: { 'Skip-Auth': 'true' },
    });
    return true;
  } catch {
    return false;
  }
}

export async function getLoad(client: ApiClient, _apiBaseUrl?: string): Promise<ServerLoad> {
  const stats = await getSystemStats(client);
  return { load: stats.cpu_load ?? 0 };
}

export async function getDiskPercent(client: ApiClient, _apiBaseUrl?: string): Promise<DiskUsage> {
  const stats = await getSystemStats(client);
  // The UI renders `usage` directly as GB (Server.tsx), so convert bytes to GiB.
  const usedBytes = stats.used_disk;
  return {
    usage: usedBytes == null ? undefined : usedBytes / (1024 * 1024 * 1024),
    percent: stats.disk_usage_percent ?? undefined,
  };
}

export async function getConfigs(client: ApiClient): Promise<Config[]> {
  const response = await client.get('/api/v3/configs', {
    params: { page: 1, page_size: 1000 },
    intent: 'Fetch configs',
  });
  const page = PaginatedConfigsResponseSchema.parse(response.data);
  return page.items.map(mapConfig);
}

export async function fetchMinStreamingPort(_client: ApiClient): Promise<number | null> {
  // Multi-port ZMS streaming is a legacy concept; v3 streams via /api/v3/live.
  return null;
}
