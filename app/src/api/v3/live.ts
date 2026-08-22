/**
 * Live streaming session API - v3 (zm-api).
 *
 * A v3 live stream is a session: POST start spins up the requested transports
 * and returns their URLs; DELETE stop tears it down. See ./STREAMING.md.
 */

import type { ApiClient } from '../client';
import { StartLiveResponseSchema, type StartLiveResponse } from './types';
import { log, LogLevel } from '../../lib/logger';

export interface StartLiveOptions {
  enableWebrtc?: boolean;
  enableHls?: boolean;
}

export async function startLive(
  client: ApiClient,
  monitorId: string | number,
  options: StartLiveOptions = {},
): Promise<StartLiveResponse> {
  // The deployed API's StartLiveRequest declares only these two transports.
  const body = {
    enable_webrtc: options.enableWebrtc ?? false,
    enable_hls: options.enableHls ?? true,
  };
  // An already-running session is reported as a CONFLICT_ERROR. The deployed
  // server returns it as HTTP 500 (the OpenAPI spec documents 409), so accept
  // both and detect by the error `kind` rather than the status code alone.
  const response = await client.post(`/api/v3/live/${monitorId}/start`, body, {
    intent: `Start live stream for monitor ${monitorId}`,
    expectedStatuses: [409, 500],
    validateStatus: (s) => (s >= 200 && s < 300) || s === 409 || s === 500,
  });

  const data = response.data as Record<string, unknown> | undefined;
  const isConflict =
    response.status === 409 ||
    (data?.kind === 'CONFLICT_ERROR');

  if (isConflict) {
    // Body is an error, not a session - synthesize the conventional transport
    // URLs for the already-running session from what we requested.
    return {
      monitor_id: Number(monitorId),
      status: 'already_running',
      hls_playlist: body.enable_hls ? `/api/v3/live/${monitorId}/hls/live.m3u8` : null,
      webrtc_signaling: body.enable_webrtc ? `/api/v3/live/${monitorId}/webrtc/ws` : null,
    };
  }

  // Any other 500 is a genuine failure - surface it.
  if (response.status >= 400) {
    const message = (data?.error_message as string) || `Failed to start live stream (${response.status})`;
    throw new Error(message);
  }
  return StartLiveResponseSchema.parse(response.data);
}

export async function stopLive(client: ApiClient, monitorId: string | number): Promise<void> {
  try {
    await client.delete(`/api/v3/live/${monitorId}/stop`, {
      intent: `Stop live stream for monitor ${monitorId}`,
      // Stop is idempotent server-side; never surface teardown errors.
      validateStatus: (s) => s >= 200 && s < 500,
    });
  } catch (error) {
    log.api('Failed to stop v3 live session (ignored)', LogLevel.DEBUG, { monitorId, error });
  }
}
