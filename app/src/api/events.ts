/**
 * Events API - backend dispatcher. See api/groups.ts for the pattern.
 *
 * The event media URL helpers (getEventImageUrl / getEventVideoUrl /
 * getEventZmsUrl) build legacy ZMS and index.php URLs. v3 has no analog - its
 * playback goes through the v3 player - so both backends share the legacy
 * builders and v3 callers simply do not use them. getMonitorEventsSince is
 * likewise legacy-only: it backs the legacy event poller.
 */

import type { ApiClient } from './client';
import type { EventsResponse, EventData, ProfileId } from './types';
import * as legacy from './legacy/events';
import * as v3 from './v3/events';

export type { EventFilters, ConsoleEventCount } from './legacy/events';
import type { EventFilters, ConsoleEventCount } from './legacy/events';

export function getEvents(
  client: ApiClient,
  profileId: ProfileId,
  filters: EventFilters = {},
): Promise<EventsResponse> {
  return client.backend === 'zmapi-v3'
    ? v3.getEvents(client, profileId, filters)
    : legacy.getEvents(client, profileId, filters);
}

export function getAdjacentEvent(
  client: ApiClient,
  profileId: ProfileId,
  direction: 'next' | 'prev',
  currentStartDateTime: string,
  filters: EventFilters = {},
): Promise<EventData | null> {
  return client.backend === 'zmapi-v3'
    ? v3.getAdjacentEvent(client, profileId, direction, currentStartDateTime, filters)
    : legacy.getAdjacentEvent(client, profileId, direction, currentStartDateTime, filters);
}

export function getEvent(client: ApiClient, eventId: string): Promise<EventData> {
  return client.backend === 'zmapi-v3' ? v3.getEvent(client, eventId) : legacy.getEvent(client, eventId);
}

export function deleteEvent(client: ApiClient, eventId: string): Promise<void> {
  return client.backend === 'zmapi-v3'
    ? v3.deleteEvent(client, eventId)
    : legacy.deleteEvent(client, eventId);
}

export function setEventArchived(
  client: ApiClient,
  eventId: string,
  archived: boolean,
): Promise<void> {
  return client.backend === 'zmapi-v3'
    ? v3.setEventArchived(client, eventId, archived)
    : legacy.setEventArchived(client, eventId, archived);
}

export function getConsoleEvents(
  client: ApiClient,
  profileId: ProfileId,
  interval: string,
): Promise<ConsoleEventCount[]> {
  return client.backend === 'zmapi-v3'
    ? v3.getConsoleEvents(client, profileId, interval)
    : legacy.getConsoleEvents(client, interval);
}

export const getMonitorEventsSince = legacy.getMonitorEventsSince;
export const getEventImageUrl = legacy.getEventImageUrl;
export const getEventVideoUrl = legacy.getEventVideoUrl;
export const getEventZmsUrl = legacy.getEventZmsUrl;
