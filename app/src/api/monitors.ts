/**
 * Monitors API - backend dispatcher. See api/groups.ts for the pattern.
 *
 * PTZ lives in a separate v3 module (api/v3/controls.ts) because v3 keys
 * control capabilities by monitor while legacy keys them by control id.
 * getStreamUrl builds a legacy ZMS/CGI URL with no v3 analog - v3 components
 * use the dedicated v3 live-stream hook - so both backends share it.
 */

import type { ApiClient } from './client';
import type {
  MonitorsResponse,
  MonitorData,
  ControlData,
  AlarmStatusResponse,
  DaemonStatusResponse,
  ProfileId,
} from './types';
import * as legacy from './legacy/monitors';
import * as v3 from './v3/monitors';
import * as v3controls from './v3/controls';

export function getMonitors(
  client: ApiClient,
  profileId: ProfileId,
  options?: { includeExcluded?: boolean },
): Promise<MonitorsResponse> {
  return client.backend === 'zmapi-v3'
    ? v3.getMonitors(client, profileId, options)
    : legacy.getMonitors(client, profileId, options);
}

export function getMonitor(client: ApiClient, monitorId: string): Promise<MonitorData> {
  return client.backend === 'zmapi-v3'
    ? v3.getMonitor(client, monitorId)
    : legacy.getMonitor(client, monitorId);
}

export function getControl(
  client: ApiClient,
  controlId: string,
  monitorId?: string,
): Promise<ControlData> {
  // v3 PTZ capabilities are keyed by monitor, not by control id.
  return client.backend === 'zmapi-v3'
    ? v3controls.getControl(client, monitorId ?? controlId)
    : legacy.getControl(client, controlId);
}

export function updateMonitor(
  client: ApiClient,
  monitorId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  return client.backend === 'zmapi-v3'
    ? v3.updateMonitor(client, monitorId, updates)
    : legacy.updateMonitor(client, monitorId, updates);
}

export function changeMonitorFunction(
  client: ApiClient,
  monitorId: string,
  func: 'None' | 'Monitor' | 'Modect' | 'Record' | 'Mocord' | 'Nodect',
): Promise<void> {
  return client.backend === 'zmapi-v3'
    ? v3.changeMonitorFunction(client, monitorId, func)
    : legacy.changeMonitorFunction(client, monitorId, func);
}

export function updateMonitorCapture(
  client: ApiClient,
  monitorId: string,
  settings: {
    Capturing?: 'None' | 'Ondemand' | 'Always';
    Analysing?: 'None' | 'Always';
    Recording?: 'None' | 'OnMotion' | 'Always';
  },
): Promise<void> {
  return client.backend === 'zmapi-v3'
    ? v3.updateMonitorCapture(client, monitorId, settings)
    : legacy.updateMonitorCapture(client, monitorId, settings);
}

export function setMonitorEnabled(
  client: ApiClient,
  monitorId: string,
  enabled: boolean,
): Promise<void> {
  return client.backend === 'zmapi-v3'
    ? v3.setMonitorEnabled(client, monitorId, enabled)
    : legacy.setMonitorEnabled(client, monitorId, enabled);
}

export function triggerAlarm(
  client: ApiClient,
  monitorId: string,
  apiBaseUrl?: string,
): Promise<void> {
  return client.backend === 'zmapi-v3'
    ? v3.triggerAlarm(client, monitorId)
    : legacy.triggerAlarm(client, monitorId, apiBaseUrl);
}

export function cancelAlarm(
  client: ApiClient,
  monitorId: string,
  apiBaseUrl?: string,
): Promise<void> {
  return client.backend === 'zmapi-v3'
    ? v3.cancelAlarm(client, monitorId)
    : legacy.cancelAlarm(client, monitorId, apiBaseUrl);
}

export function getAlarmStatus(
  client: ApiClient,
  monitorId: string,
  apiBaseUrl?: string,
): Promise<AlarmStatusResponse> {
  return client.backend === 'zmapi-v3'
    ? v3.getAlarmStatus(client, monitorId)
    : legacy.getAlarmStatus(client, monitorId, apiBaseUrl);
}

export function getDaemonStatus(
  client: ApiClient,
  monitorId: string,
  daemon: 'zmc' | 'zma',
  apiBaseUrl?: string,
): Promise<DaemonStatusResponse> {
  return client.backend === 'zmapi-v3'
    ? v3.getDaemonStatus(client, monitorId, daemon)
    : legacy.getDaemonStatus(client, monitorId, daemon, apiBaseUrl);
}

export function controlMonitor(
  client: ApiClient,
  portalUrl: string,
  monitorId: string,
  command: string,
  token?: string,
  minStreamingPort?: number,
): Promise<void> {
  return client.backend === 'zmapi-v3'
    ? v3controls.controlMonitor(client, monitorId, command)
    : legacy.controlMonitor(client, portalUrl, monitorId, command, token, minStreamingPort);
}

export const getStreamUrl = legacy.getStreamUrl;
