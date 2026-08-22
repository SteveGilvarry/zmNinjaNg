/**
 * Tags API - backend dispatcher. See api/groups.ts for the pattern.
 *
 * extractUniqueTags deduplicates an already fetched TagsResponse, so both
 * backends share the legacy implementation.
 */

import type { ApiClient } from './client';
import type { Tag, TagsResponse } from './types';
import * as legacy from './legacy/tags';
import * as v3 from './v3/tags';

export function getTags(client: ApiClient): Promise<TagsResponse | null> {
  return client.backend === 'zmapi-v3' ? v3.getTags(client) : legacy.getTags(client);
}

export function getEventTags(
  client: ApiClient,
  eventIds: string[],
): Promise<Map<string, Tag[]> | null> {
  return client.backend === 'zmapi-v3'
    ? v3.getEventTags(client, eventIds)
    : legacy.getEventTags(client, eventIds);
}

export const extractUniqueTags = legacy.extractUniqueTags;
