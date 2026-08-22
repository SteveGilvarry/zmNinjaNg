/**
 * Tags API - v3 (zm-api) implementation.
 *
 * v3 exposes a first-class /tags collection and a /events-tags association
 * table. getEventTags resolves the association rows (tag_id, event_id) against
 * the /tags collection to build the per-event Tag map the UI expects.
 */

import type { ApiClient } from '../client';
import type { TagsResponse, Tag } from '../types';
import { PaginatedTagsResponseSchema, PaginatedEventTagsResponseSchema } from './types';
import { mapTag } from './mappers';
import { log, LogLevel } from '../../lib/logger';
import type { HttpError } from '../../lib/http';

export async function getTags(client: ApiClient): Promise<TagsResponse | null> {
  try {
    const response = await client.get('/api/v3/tags', {
      intent: 'Fetch tags list',
      params: { page: 1, page_size: 500 },
      expectedStatuses: [404],
    });
    const page = PaginatedTagsResponseSchema.parse(response.data);
    return { tags: page.items.map((t) => ({ Tag: mapTag(t) })) };
  } catch (error) {
    const status = (error as HttpError).status;
    if (status === 404 || status === 401 || status === 403) {
      log.api('v3 tags not available', LogLevel.INFO, { status });
      return null;
    }
    log.api('Failed to fetch v3 tags', LogLevel.ERROR, { error });
    throw error;
  }
}

/** Largest page the /events-tags and /tags endpoints are asked for at once. */
const TAGS_PAGE_SIZE = 500;
/** Stop paging the association table after this many pages as a safety bound. */
const MAX_EVENT_TAG_PAGES = 50;

export async function getEventTags(client: ApiClient, eventIds: string[]): Promise<Map<string, Tag[]> | null> {
  if (eventIds.length === 0) return new Map();

  try {
    // tag_id -> Tag. The association rows only carry ids, so resolve names here.
    const tagsResp = await getTags(client);
    const tagById = new Map<string, Tag>();
    if (tagsResp) {
      for (const { Tag: tag } of tagsResp.tags) tagById.set(tag.Id, tag);
    }

    // Walk the association table once and keep rows for the requested events.
    // Bounded by association count (tags are sparse), not by event count.
    const wanted = new Set(eventIds.map(String));
    const map = new Map<string, Tag[]>();

    for (let pageNum = 1; pageNum <= MAX_EVENT_TAG_PAGES; pageNum++) {
      const response = await client.get('/api/v3/events-tags', {
        intent: 'Fetch event tag associations',
        params: { page: pageNum, page_size: TAGS_PAGE_SIZE },
        expectedStatuses: [404],
      });
      const page = PaginatedEventTagsResponseSchema.parse(response.data);

      for (const assoc of page.items) {
        const eventId = String(assoc.event_id);
        if (!wanted.has(eventId)) continue;
        const tag = tagById.get(String(assoc.tag_id));
        if (!tag) continue;
        const existing = map.get(eventId) ?? [];
        if (!existing.some((t) => t.Id === tag.Id)) {
          existing.push(tag);
          map.set(eventId, existing);
        }
      }

      if (page.current_page >= page.last_page) break;
    }

    return map;
  } catch (error) {
    const status = (error as HttpError).status;
    if (status === 404 || status === 401 || status === 403) {
      log.api('v3 event tags not available', LogLevel.INFO, { status });
      return null;
    }
    log.api('Failed to fetch v3 event tags', LogLevel.ERROR, { error });
    throw error;
  }
}
