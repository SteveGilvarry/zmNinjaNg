/**
 * Per-monitor v3 live-session coordinator.
 *
 * A live stream is a server-side session (POST /live/{id}/start ... DELETE stop).
 * Multiple consumers (montage tile + detail view) and React StrictMode's
 * mount→unmount→mount cycle would otherwise churn start/stop and race a
 * fire-and-forget stop against the next start - leaving the new WebSocket
 * attached to a session that's being torn down (stuck "connecting").
 *
 * This module reference-counts sessions per monitor and debounces the stop, so a
 * quick release+acquire reuses the running session instead of restarting it.
 */

import { startLive, stopLive } from '../api/v3/live';
import type { StartLiveResponse } from '../api/v3/types';
import type { ApiClient } from '../api/client';
import type { ProfileId } from '../api/types';
import { monitorCacheKey } from '../stores/monitors';
import { log, LogLevel } from './logger';

interface SessionEntry {
  refs: number;
  startPromise: Promise<StartLiveResponse> | null;
  stopTimer: ReturnType<typeof setTimeout> | null;
  /** The owning profile's client, so the debounced stop reaches the same server. */
  client: ApiClient;
  monitorId: string;
}

// Keyed by profile + monitor: raw ZoneMinder monitor ids collide across
// servers, so in All mode two profiles' monitor 3 would otherwise share one
// refcount and stop each other's stream (Aggregation contract).
const sessions = new Map<string, SessionEntry>();

/** How long to keep a session alive after the last consumer releases it. */
const STOP_DEBOUNCE_MS = 3000;

/**
 * Acquire (and start if needed) the live session for a monitor. Returns the
 * session descriptor (HLS/WebRTC URLs). Safe to call concurrently - the start is
 * shared. Each acquire must be balanced by exactly one releaseLiveSession.
 */
export function acquireLiveSession(
  client: ApiClient,
  profileId: ProfileId,
  monitorId: string,
): Promise<StartLiveResponse> {
  const key = monitorCacheKey(profileId, monitorId);
  let entry = sessions.get(key);
  if (!entry) {
    entry = { refs: 0, startPromise: null, stopTimer: null, client, monitorId };
    sessions.set(key, entry);
  }
  entry.refs += 1;
  if (entry.stopTimer) {
    clearTimeout(entry.stopTimer);
    entry.stopTimer = null;
  }
  if (!entry.startPromise) {
    entry.startPromise = startLive(client, monitorId, {
      enableWebrtc: true,
      enableHls: true,
    }).catch((e) => {
      // Allow a later acquire to retry after a failed start.
      if (sessions.get(key) === entry) entry!.startPromise = null;
      throw e;
    });
  }
  return entry.startPromise;
}

/**
 * Release a previously acquired session. When the last consumer releases, the
 * server-side session is stopped after a short debounce (so a remount reuses it).
 */
export function releaseLiveSession(profileId: ProfileId, monitorId: string): void {
  const key = monitorCacheKey(profileId, monitorId);
  const entry = sessions.get(key);
  if (!entry) return;
  entry.refs = Math.max(0, entry.refs - 1);
  if (entry.refs > 0) return;

  if (entry.stopTimer) clearTimeout(entry.stopTimer);
  entry.stopTimer = setTimeout(() => {
    sessions.delete(key);
    log.api('Stopping idle v3 live session', LogLevel.DEBUG, { profileId, monitorId });
    // The entry's own client, not the caller's: by the time the debounce
    // fires the user may have switched profiles.
    void stopLive(entry.client, entry.monitorId);
  }, STOP_DEBOUNCE_MS);
}
