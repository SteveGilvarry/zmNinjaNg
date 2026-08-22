/**
 * Time API - v3 (zm-api) implementation.
 *
 * zm-api exposes no server-timezone endpoint, so fall back to the device's
 * resolved timezone. Date formatting in the app already tolerates this.
 *
 * The client and token parameters are unused but kept so the signature matches
 * the legacy implementation and api/time.ts can dispatch on backend alone.
 */

import type { ApiClient } from '../client';

export async function getServerTimeZone(_client: ApiClient, _token?: string): Promise<string> {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
