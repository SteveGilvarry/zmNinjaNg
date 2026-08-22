/**
 * Events API - v3 (zm-api) implementation.
 *
 * Mirrors api/legacy/events.ts against the JSON /api/v3 endpoints, mapping
 * responses back to the app's EventData/EventsResponse shapes.
 */

import type { ApiClient } from '../client';
import type { EventsResponse, EventData, ProfileId } from '../types';
import type { ConsoleEventCount, EventFilters } from '../legacy/events';
import {
  PaginatedEventsResponseSchema,
  EventResponseSchema,
  EventCountsByMonitorResponseSchema,
} from './types';
import { mapEventData } from './mappers';
import { log, LogLevel } from '../../lib/logger';
import { getExcludedMonitorIds } from '../../lib/profile/profile-settings';

const SORT_MAP: Record<string, string> = {
  StartDateTime: 'start_time',
  EndDateTime: 'end_time',
  MaxScore: 'max_score',
  AvgScore: 'avg_score',
  TotScore: 'tot_score',
  AlarmFrames: 'alarm_frames',
  Length: 'length',
  Id: 'id',
};

/**
 * The v3 server parses start_time/end_time as RFC3339 and rejects a naive
 * datetime ("2026-06-08T19:27:31" => 400 "premature end of input"). Legacy
 * filters carry naive local wall-clock strings, so convert them to a full
 * RFC3339 instant. Strings that already carry a zone (Z or +hh:mm) pass through.
 */
export function toV3Timestamp(value: string): string {
  const v = value.trim().replace(' ', 'T');
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
}

function buildEventParams(filters: EventFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  // v3 takes a single monitor_id; comma lists are filtered client-side instead.
  if (filters.monitorId && !filters.monitorId.includes(',')) {
    params.monitor_id = filters.monitorId.trim();
  }
  if (filters.startDateTime) params.start_time = toV3Timestamp(filters.startDateTime);
  if (filters.endDateTime) params.end_time = toV3Timestamp(filters.endDateTime);
  if (filters.minAlarmFrames) params.alarm_frames_min = filters.minAlarmFrames;
  if (filters.archived !== undefined) params.archived = filters.archived ? 'true' : 'false';
  if (filters.sort) params.sort = SORT_MAP[filters.sort] ?? 'start_time';
  if (filters.direction) params.direction = filters.direction;
  return params;
}

/** Monitor ids to keep when a comma-separated monitorId filter was supplied. */
function monitorIdAllowList(filters: EventFilters): Set<string> | null {
  if (!filters.monitorId || !filters.monitorId.includes(',')) return null;
  return new Set(filters.monitorId.split(',').map((id) => id.trim()));
}

export async function getEvents(
  client: ApiClient,
  profileId: ProfileId,
  filters: EventFilters = {},
): Promise<EventsResponse> {
  const desiredLimit = filters.limit || 100;
  const params = { page: 1, page_size: desiredLimit, ...buildEventParams(filters) };

  const response = await client.get('/api/v3/events', {
    params,
    intent: 'Fetch events list',
  });
  const page = PaginatedEventsResponseSchema.parse(response.data);

  const excluded = new Set(getExcludedMonitorIds(profileId));
  const allow = monitorIdAllowList(filters);

  let events: EventData[] = page.items.map(mapEventData);
  events = events.filter((e) => {
    if (excluded.has(e.Event.MonitorId)) return false;
    if (allow && !allow.has(e.Event.MonitorId)) return false;
    return true;
  });
  events = events.slice(0, desiredLimit);

  const totalCount = page.total;
  return {
    events,
    pagination: {
      page: 1,
      pageCount: page.last_page,
      current: page.current_page,
      count: events.length,
      prevPage: page.current_page > 1,
      nextPage: page.current_page < page.last_page,
      limit: desiredLimit,
      totalCount,
    },
  };
}

export async function getAdjacentEvent(
  client: ApiClient,
  profileId: ProfileId,
  direction: 'next' | 'prev',
  currentStartDateTime: string,
  filters: EventFilters = {},
): Promise<EventData | null> {
  const excluded = new Set(getExcludedMonitorIds(profileId));
  const allow = monitorIdAllowList(filters);
  const iso = toV3Timestamp(currentStartDateTime);

  // 'next' => later events ascending; 'prev' => earlier events descending.
  const params: Record<string, string | number> = {
    page: 1,
    page_size: excluded.size || allow ? 25 : 5,
    sort: 'start_time',
    direction: direction === 'next' ? 'asc' : 'desc',
    ...(direction === 'next' ? { start_time: iso } : { end_time: iso }),
  };
  if (filters.monitorId && !filters.monitorId.includes(',')) {
    params.monitor_id = filters.monitorId.trim();
  }

  try {
    const response = await client.get('/api/v3/events', { params });
    const page = PaginatedEventsResponseSchema.parse(response.data);
    for (const item of page.items) {
      const data = mapEventData(item);
      if (data.Event.StartDateTime === currentStartDateTime) continue; // skip self
      if (excluded.has(data.Event.MonitorId)) continue;
      if (allow && !allow.has(data.Event.MonitorId)) continue;
      return data;
    }
    return null;
  } catch (err) {
    log.api('Failed to fetch adjacent event (v3)', LogLevel.ERROR, { direction, error: err });
    return null;
  }
}

export async function getEvent(client: ApiClient, eventId: string): Promise<EventData> {
  const response = await client.get(`/api/v3/events/${eventId}`, {
    intent: `Fetch event ${eventId}`,
  });
  return mapEventData(EventResponseSchema.parse(response.data));
}

export async function deleteEvent(client: ApiClient, eventId: string): Promise<void> {
  await client.delete(`/api/v3/events/${eventId}`);
}

export async function setEventArchived(client: ApiClient, eventId: string, archived: boolean): Promise<void> {
  await client.patch(`/api/v3/events/${eventId}`, { archived });
}

/** Parse a ZM-style interval string ('1 hour', '6 hours', '1 day', '1 week') into hours. */
function intervalToHours(interval: string): number {
  const m = interval.trim().match(/^(\d+)\s*(hour|day|week|min|minute)/i);
  if (!m) return 1;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit.startsWith('day')) return n * 24;
  if (unit.startsWith('week')) return n * 168;
  if (unit.startsWith('min')) return Math.max(1, Math.round(n / 60));
  return n; // hours
}

export async function getConsoleEvents(
  client: ApiClient,
  profileId: ProfileId,
  interval: string,
): Promise<ConsoleEventCount[]> {
  const hours = intervalToHours(interval);
  const response = await client.get(`/api/v3/events/counts-by-monitor/${hours}`, {
    intent: `Fetch event counts (${hours}h)`,
  });
  const parsed = EventCountsByMonitorResponseSchema.parse(response.data);

  const excluded = new Set(getExcludedMonitorIds(profileId));
  return parsed.counts
    .filter(({ monitor_id }) => !excluded.has(String(monitor_id)))
    .map(({ monitor_id, count }) => ({ monitorId: String(monitor_id), count }));
}

/**
 * How many events a monitor has recorded since a watermark, and the newest
 * one's timestamp. Backs the new-event badge on monitor tiles.
 *
 * Only the count and the newest timestamp are needed, so this asks for a single
 * event sorted newest-first and reads the total off the pagination envelope.
 */
export async function getMonitorEventsSince(
  client: ApiClient,
  monitorId: string,
  since: string | null,
): Promise<{ count: number; newest: string | null }> {
  const params: Record<string, string | number> = {
    monitor_id: monitorId,
    page: 1,
    page_size: 1,
    sort: 'start_time',
    direction: 'desc',
  };
  // No watermark means this is the first poll for the monitor: ask for its
  // newest event outright rather than filtering from the beginning of time.
  if (since !== null) params.start_time = toV3Timestamp(since);

  const response = await client.get('/api/v3/events', {
    params,
    intent: `Count events for monitor ${monitorId} since ${since ?? 'the beginning'}`,
  });
  const page = PaginatedEventsResponseSchema.parse(response.data);

  const newest = page.items[0] ? mapEventData(page.items[0]).Event.StartDateTime : null;

  log.api('Counted new events for monitor (v3)', LogLevel.DEBUG, {
    monitorId,
    since,
    count: page.total,
  });

  return { count: page.total, newest };
}
