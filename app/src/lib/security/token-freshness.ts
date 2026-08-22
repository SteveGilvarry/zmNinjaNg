/**
 * How much validity an access token needs left before the app treats it as
 * usable for building a URL the browser will load directly.
 *
 * The rule has to hold for both backends, whose tokens differ by an order of
 * magnitude: legacy ZoneMinder issues hour-long access tokens, zm-api issues
 * 600-second ones. A flat 30-minute leeway suits the first and is impossible
 * for the second - nothing ever has 30 minutes left, so every token-bearing
 * URL goes out unauthenticated and the refresh effect refires on every render.
 *
 * Deriving the leeway from the token's own lifetime fixes that without a
 * per-backend branch, and cannot be wrong for whatever TTL a server picks next.
 */

import { ZM_INTEGRATION } from '../zmninja-ng-constants';

/**
 * @param lifetimeMs - The token's total validity when issued. Absent for
 *   tokens minted before this was recorded, which fall back to the flat
 *   leeway so legacy sessions behave exactly as they did.
 * @returns Milliseconds of remaining validity a token must have to be usable.
 */
export function resolveAccessTokenLeewayMs(lifetimeMs: number | null | undefined): number {
  const flat = ZM_INTEGRATION.accessTokenLeewayMs;
  // A missing or nonsensical lifetime means "unknown", not "expire instantly":
  // a zero leeway would hand out a token that dies mid-request.
  if (!lifetimeMs || lifetimeMs <= 0) return flat;
  // Half the lifetime leaves the token usable for its first half and refreshing
  // through its second, which is the behaviour legacy already had at 60m/30m.
  return Math.min(flat, Math.floor(lifetimeMs / 2));
}
