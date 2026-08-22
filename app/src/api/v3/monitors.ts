/**
 * Monitors API - v3 (zm-api) implementation.
 *
 * Mirrors the public surface of api/legacy/monitors.ts but talks to the JSON
 * /api/v3 endpoints and maps responses back into the app's domain types via
 * api/v3/mappers.ts. The dispatcher in api/monitors.ts forwards to these based
 * on the active profile's backend.
 */

import type { ApiClient } from '../client';
import type { ProfileId } from '../types';
import type {
  MonitorsResponse,
  MonitorData,
  AlarmStatusResponse,
  DaemonStatusResponse,
} from '../types';
import {
  PaginatedMonitorsResponseSchema,
  MonitorResponseSchema,
  MonitorStatusResponseSchema,
  type MonitorStatusResponse,
} from './types';
import { mapMonitorData } from './mappers';
import { log, LogLevel } from '../../lib/logger';
import { filterExcludedMonitors } from '../../lib/monitor/filters';
import { getExcludedMonitorIds } from '../../lib/profile/profile-settings';

// Pull a full page of monitors in one request; ZoneMinder installs rarely have
// more than a few dozen monitors.
const PAGE_SIZE = 500;

/** Fetch the monitor-status list and key it by monitor id (best-effort). */
async function fetchStatusMap(client: ApiClient): Promise<Map<number, MonitorStatusResponse>> {
  const map = new Map<number, MonitorStatusResponse>();
  try {
    const response = await client.get('/api/v3/monitor-status', {
      intent: 'Fetch monitor statuses',
      params: { page_size: PAGE_SIZE },
    });
    const data = response.data as { items?: unknown[] } | unknown[];
    const items = Array.isArray(data) ? data : (data?.items ?? []);
    for (const item of items) {
      const parsed = MonitorStatusResponseSchema.safeParse(item);
      if (parsed.success) map.set(parsed.data.monitor_id, parsed.data);
    }
  } catch (error) {
    log.api('Failed to fetch v3 monitor statuses; continuing without', LogLevel.DEBUG, { error });
  }
  return map;
}

export async function getMonitors(
  client: ApiClient,
  profileId: ProfileId,
  options?: { includeExcluded?: boolean },
): Promise<MonitorsResponse> {
  const response = await client.get('/api/v3/monitors', {
    intent: 'Fetch monitors list',
    params: { page: 1, page_size: PAGE_SIZE },
  });

  const page = PaginatedMonitorsResponseSchema.parse(response.data);
  const statuses = await fetchStatusMap(client);

  let monitors: MonitorData[] = page.items
    .filter((m) => m.deleted !== 1)
    .map((m) => mapMonitorData(m, statuses.get(m.id)));

  if (!options?.includeExcluded) {
    monitors = filterExcludedMonitors(monitors, getExcludedMonitorIds(profileId));
  }

  return { monitors };
}

export async function getMonitor(client: ApiClient, monitorId: string): Promise<MonitorData> {
  const response = await client.get(`/api/v3/monitors/${monitorId}`, {
    intent: `Fetch monitor ${monitorId}`,
  });
  const monitor = MonitorResponseSchema.parse(response.data);

  let status: MonitorStatusResponse | undefined;
  try {
    const statusResp = await client.get(`/api/v3/monitor-status/${monitorId}`, {
      intent: `Fetch monitor ${monitorId} status`,
      expectedStatuses: [404],
    });
    const parsed = MonitorStatusResponseSchema.safeParse(statusResp.data);
    if (parsed.success) status = parsed.data;
  } catch {
    // status is optional
  }

  return mapMonitorData(monitor, status);
}

/**
 * Generic monitor update. Accepts snake_case v3 fields directly; also tolerates
 * the legacy `Monitor[Field]` bracket keys used by some callers by translating
 * the common ones.
 */
export async function updateMonitor(
  client: ApiClient,
  monitorId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const body: Record<string, unknown> = {};
  const legacyKey = /^Monitor\[(\w+)\]$/;
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null) continue;
    const m = key.match(legacyKey);
    if (m) {
      // Translate the handful of legacy bracket keys we emit elsewhere.
      const field = m[1];
      const map: Record<string, string> = {
        Function: 'function',
        Capturing: 'capturing',
        Analysing: 'analysing',
        Recording: 'recording',
        Enabled: 'capturing', // see setMonitorEnabled
        Name: 'name',
      };
      const target = map[field];
      if (target === 'capturing' && field === 'Enabled') {
        body.capturing = value === '1' || value === 1 ? 'Always' : 'None';
      } else if (target) {
        body[target] = value;
      }
    } else {
      body[key] = value;
    }
  }

  log.api('Updating monitor (v3)', LogLevel.INFO, { monitorId, body });
  await client.patch(`/api/v3/monitors/${monitorId}`, body);
}

export async function changeMonitorFunction(
  client: ApiClient,
  monitorId: string,
  func: 'None' | 'Monitor' | 'Modect' | 'Record' | 'Mocord' | 'Nodect',
): Promise<void> {
  await patchMonitor(client, monitorId, { function: func });
}

export async function updateMonitorCapture(
  client: ApiClient,
  monitorId: string,
  settings: {
    Capturing?: 'None' | 'Ondemand' | 'Always';
    Analysing?: 'None' | 'Always';
    Recording?: 'None' | 'OnMotion' | 'Always';
  },
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (settings.Capturing !== undefined) body.capturing = settings.Capturing;
  if (settings.Analysing !== undefined) body.analysing = settings.Analysing;
  if (settings.Recording !== undefined) body.recording = settings.Recording;
  await patchMonitor(client, monitorId, body);
}

export async function setMonitorEnabled(client: ApiClient, monitorId: string, enabled: boolean): Promise<void> {
  // v3 has no single Enabled column; toggle capturing as the closest analog.
  await patchMonitor(client, monitorId, { capturing: enabled ? 'Always' : 'None' });
}

/** PATCH /monitors/{id} with a snake_case partial body. */
async function patchMonitor(client: ApiClient, monitorId: string, body: Record<string, unknown>): Promise<void> {
  log.api('Patching monitor (v3)', LogLevel.INFO, { monitorId, body });
  await client.patch(`/api/v3/monitors/${monitorId}`, body);
}

async function alarmControl(
  client: ApiClient,
  monitorId: string,
  action: 'on' | 'off' | 'status',
): Promise<AlarmStatusResponse> {
  const response = await client.patch(`/api/v3/monitors/${monitorId}/alarm`, { action }, {
    intent: `Monitor ${monitorId} alarm ${action}`,
  });
  const data = (response.data ?? {}) as Record<string, unknown>;
  const status = (data.status ?? data.state ?? 'unknown') as string | number;
  return { status };
}

export async function triggerAlarm(client: ApiClient, monitorId: string): Promise<void> {
  await alarmControl(client, monitorId, 'on');
}

export async function cancelAlarm(client: ApiClient, monitorId: string): Promise<void> {
  await alarmControl(client, monitorId, 'off');
}

export async function getAlarmStatus(client: ApiClient, monitorId: string): Promise<AlarmStatusResponse> {
  return alarmControl(client, monitorId, 'status');
}

export async function getDaemonStatus(
  client: ApiClient,
  monitorId: string,
  _daemon: 'zmc' | 'zma',
): Promise<DaemonStatusResponse> {
  // Approximate the legacy daemonStatus probe from the monitor-status row.
  try {
    const response = await client.get(`/api/v3/monitor-status/${monitorId}`, {
      intent: `Fetch monitor ${monitorId} daemon status`,
      expectedStatuses: [404],
    });
    const parsed = MonitorStatusResponseSchema.safeParse(response.data);
    const running = parsed.success && parsed.data.status?.toLowerCase() === 'connected';
    return { status: running ? '1' : '0', statustext: parsed.success ? parsed.data.status : undefined };
  } catch {
    return { status: '0' };
  }
}

// getControl + controlMonitor live in api/v3/controls.ts (PTZ).
