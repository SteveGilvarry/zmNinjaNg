import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route mock client.get by URL so getEventTags can resolve /tags then walk
// /events-tags. Pages are keyed by the requested page number.
const tagsPage = {
  items: [
    { id: 1, name: 'intruder', create_date: '2026-01-01T00:00:00Z', event_count: 3 },
    { id: 2, name: 'review', create_date: null, event_count: 1 },
  ],
  total: 2, per_page: 500, current_page: 1, last_page: 1,
};

let eventTagPages: Record<number, unknown> = {};
let throwStatus: number | null = null;

const get = vi.fn(async (url: string, opts?: { params?: { page?: number } }) => {
  if (throwStatus && url.includes('events-tags')) {
    throw { status: throwStatus };
  }
  if (url.includes('/api/v3/tags')) return { data: tagsPage };
  if (url.includes('/api/v3/events-tags')) {
    const page = opts?.params?.page ?? 1;
    return { data: eventTagPages[page] };
  }
  throw new Error('unexpected url ' + url);
});

vi.mock('../../../lib/logger', () => ({ log: { api: vi.fn() }, LogLevel: { INFO: 1, ERROR: 4 } }));

import type { ApiClient } from '../../client';
import { getEventTags } from '../tags';

// The v3 modules take their client explicitly, so the test hands them a stub
// rather than mocking a module-level accessor.
const client = { get, backend: 'zmapi-v3' } as unknown as ApiClient;

describe('v3 getEventTags', () => {
  beforeEach(() => {
    get.mockClear();
    throwStatus = null;
    eventTagPages = {
      1: {
        items: [
          { tag_id: 1, event_id: 5 },
          { tag_id: 2, event_id: 5 },
          { tag_id: 1, event_id: 9 },
          { tag_id: 2, event_id: 42 }, // not requested -> filtered out
        ],
        total: 4, per_page: 500, current_page: 1, last_page: 1,
      },
    };
  });

  it('returns an empty map without fetching when no event ids are given', async () => {
    const map = await getEventTags(client, []);
    expect(map).toEqual(new Map());
    expect(get).not.toHaveBeenCalled();
  });

  it('resolves association rows to named tags for the requested events', async () => {
    const map = await getEventTags(client, ['5', '9', '99']);
    expect(map).not.toBeNull();
    expect(map!.get('5')!.map((t) => t.Name).sort()).toEqual(['intruder', 'review']);
    expect(map!.get('9')!.map((t) => t.Name)).toEqual(['intruder']);
    expect(map!.has('99')).toBe(false); // requested but no associations
    expect(map!.has('42')).toBe(false); // association exists but not requested
  });

  it('walks multiple association pages', async () => {
    eventTagPages = {
      1: { items: [{ tag_id: 1, event_id: 5 }], total: 2, per_page: 1, current_page: 1, last_page: 2 },
      2: { items: [{ tag_id: 2, event_id: 5 }], total: 2, per_page: 1, current_page: 2, last_page: 2 },
    };
    const map = await getEventTags(client, ['5']);
    expect(map!.get('5')!.map((t) => t.Name).sort()).toEqual(['intruder', 'review']);
  });

  it('returns null when the association endpoint is unsupported (404)', async () => {
    throwStatus = 404;
    expect(await getEventTags(client, ['5'])).toBeNull();
  });
});
