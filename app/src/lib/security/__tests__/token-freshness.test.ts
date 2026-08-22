/**
 * How much validity a token needs before the app will build a URL with it.
 *
 * The leeway used to be a flat 30 minutes, which suits legacy ZoneMinder's
 * hour-long access tokens. zm-api issues 600-second ones, so nothing ever had
 * 30 minutes left: `isFresh` was false from the instant of login, every
 * token-bearing URL (event thumbnails, images, videos) went out unauthenticated
 * and 401ed, and the refresh effect refired on every render.
 */

import { describe, it, expect } from 'vitest';
import { resolveAccessTokenLeewayMs } from '../token-freshness';
import { ZM_INTEGRATION } from '../../zmninja-ng-constants';

const MIN = 60 * 1000;

describe('resolveAccessTokenLeewayMs', () => {
  it("keeps legacy's flat leeway for an hour-long token", () => {
    // 60m token, 30m leeway: unchanged from before, so legacy behaviour is
    // byte-identical.
    expect(resolveAccessTokenLeewayMs(60 * MIN)).toBe(ZM_INTEGRATION.accessTokenLeewayMs);
  });

  it('leaves a v3 token usable for part of its life', () => {
    // 10m token: half of it is usable before a refresh is wanted.
    expect(resolveAccessTokenLeewayMs(10 * MIN)).toBe(5 * MIN);
  });

  it('never demands more validity than the token can ever have', () => {
    // The defect: a leeway above the token's whole lifetime can never be met.
    for (const lifetime of [30 * 1000, 5 * MIN, 10 * MIN, 20 * MIN, 59 * MIN]) {
      expect(resolveAccessTokenLeewayMs(lifetime)).toBeLessThan(lifetime);
    }
  });

  it('falls back to the flat leeway when the lifetime is unknown', () => {
    // Tokens minted before this field existed, so legacy behaviour is the
    // safe answer rather than treating them as short-lived.
    expect(resolveAccessTokenLeewayMs(undefined)).toBe(ZM_INTEGRATION.accessTokenLeewayMs);
    expect(resolveAccessTokenLeewayMs(null)).toBe(ZM_INTEGRATION.accessTokenLeewayMs);
  });

  it('treats a nonsensical lifetime as unknown rather than as zero leeway', () => {
    // Zero leeway would hand out a token that expires mid-request.
    expect(resolveAccessTokenLeewayMs(0)).toBe(ZM_INTEGRATION.accessTokenLeewayMs);
    expect(resolveAccessTokenLeewayMs(-5)).toBe(ZM_INTEGRATION.accessTokenLeewayMs);
  });
});
