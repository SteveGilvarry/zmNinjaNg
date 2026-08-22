import { describe, it, expect, vi } from 'vitest';
import type { ApiClient } from '../../client';
import { toV3Timestamp, getMonitorEventsSince } from '../events';

describe('toV3Timestamp', () => {
  it('converts a naive local datetime to a full RFC3339 instant', () => {
    const out = toV3Timestamp('2026-06-08 19:27:31');
    // Must carry a timezone so the v3 server can deserialize it.
    expect(out).toMatch(/[zZ]$|[+-]\d{2}:\d{2}$/);
    // Same instant as the local wall-clock the user picked.
    expect(new Date(out).getTime()).toBe(new Date('2026-06-08T19:27:31').getTime());
  });

  it('accepts a space- or T-separated input', () => {
    expect(toV3Timestamp('2026-06-08 19:27:31')).toBe(toV3Timestamp('2026-06-08T19:27:31'));
  });

  it('passes through a value that already has a Z zone', () => {
    expect(toV3Timestamp('2026-06-08T19:27:31Z')).toBe('2026-06-08T19:27:31Z');
  });

  it('passes through a value that already has an offset zone', () => {
    expect(toV3Timestamp('2026-06-08T19:27:31+10:00')).toBe('2026-06-08T19:27:31+10:00');
  });

  it('leaves an unparseable string unchanged rather than emitting Invalid Date', () => {
    expect(toV3Timestamp('not-a-date')).toBe('not-a-date');
  });
});

describe('getMonitorEventsSince', () => {
  /**
   * Backs the new-event badge on monitor tiles. Without a v3 implementation the
   * dispatcher fell through to the legacy CakePHP builder, which asked a v3
   * server for /events/index/MonitorId:1.json - a route it does not serve.
   * Observed against a live server as a burst of failures, one per monitor,
   * on every montage poll.
   */
  function clientReturning(data: unknown) {
    const get = vi.fn().mockResolvedValue({ data });
    return { client: { backend: 'zmapi-v3', get } as unknown as ApiClient, get };
  }

  const page = (items: unknown[], total: number) => ({
    items,
    total,
    per_page: 1,
    current_page: 1,
    last_page: 1,
  });

  it('reports how many events the monitor has had since the watermark', async () => {
    const { client } = clientReturning(
      page([{ id: 9, monitor_id: 1, name: 'Event-9', width: 1920, height: 1080, start_date_time: '2026-06-09 10:00:00' }], 4),
    );

    await expect(getMonitorEventsSince(client, '1', '2026-06-09 09:00:00')).resolves.toEqual({
      count: 4,
      newest: expect.any(String),
    });
  });

  it('asks only this monitor, newest first, since the watermark', async () => {
    const { client, get } = clientReturning(page([], 0));

    await getMonitorEventsSince(client, '7', '2026-06-09 09:00:00');

    const [url, config] = get.mock.calls[0];
    expect(url).toContain('/api/v3/events');
    expect(config.params.monitor_id).toBe('7');
    expect(config.params.direction).toBe('desc');
    // The v3 server rejects a naive datetime, so the watermark must carry a zone.
    expect(String(config.params.start_time)).toMatch(/[zZ]$|[+-]\d{2}:\d{2}$/);
  });

  it('omits the time filter on the first poll, when there is no watermark yet', async () => {
    const { client, get } = clientReturning(page([], 0));

    await getMonitorEventsSince(client, '7', null);

    expect(get.mock.calls[0][1].params.start_time).toBeUndefined();
  });

  it('reports no events rather than throwing when the monitor has none', async () => {
    const { client } = clientReturning(page([], 0));

    await expect(getMonitorEventsSince(client, '7', null)).resolves.toEqual({
      count: 0,
      newest: null,
    });
  });
});
