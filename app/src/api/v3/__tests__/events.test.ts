import { describe, it, expect } from 'vitest';
import { toV3Timestamp } from '../events';

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
