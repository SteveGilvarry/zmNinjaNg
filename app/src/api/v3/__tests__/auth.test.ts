/**
 * v3 login, and the re-entrancy trap inside it.
 *
 * loginV3 fetches the server version before returning, because the auth store
 * records version from the LoginResponse. That call happens while the store
 * still has no token, so an ordinary authenticated request would see "not
 * authenticated" and trigger the client's proactive-login path - which dedups
 * onto the very login waiting for it, and deadlocks until the bootstrap
 * timeout. Observed against a live server: the login POST returned 200, the
 * version request never left the browser, and bootstrap failed after 20s.
 *
 * The fix is that the version call carries the freshly issued token itself and
 * skips the auth gate, so it never consults store state.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ApiClient } from '../../client';
import { loginV3, getVersionV3 } from '../auth';

const TOKEN = {
  token_type: 'Bearer',
  access_token: 'access-abc',
  refresh_token: 'refresh-def',
  expire_in: 3600,
};

const VERSION = { version: '1.38.0', api_version: '3.0.0', db_version: '1.38.0' };

function makeClient(overrides: { versionFails?: boolean } = {}) {
  const post = vi.fn().mockResolvedValue({ data: TOKEN });
  const get = vi.fn(
    async (_url: string, _config?: { headers?: Record<string, string> }) =>
      overrides.versionFails ? Promise.reject(new Error('boom')) : { data: VERSION },
  );
  const client = { backend: 'zmapi-v3', post, get } as unknown as ApiClient;
  return { client, post, get };
}

describe('loginV3', () => {
  it('maps the token response onto the app LoginResponse shape', async () => {
    const { client } = makeClient();

    await expect(loginV3({ user: 'admin', pass: 'pw' }, client)).resolves.toMatchObject({
      access_token: 'access-abc',
      refresh_token: 'refresh-def',
      access_token_expires: 3600,
    });
  });

  it('fills in the version the auth store records', async () => {
    const { client } = makeClient();

    await expect(loginV3({ user: 'admin', pass: 'pw' }, client)).resolves.toMatchObject({
      version: '1.38.0',
      apiversion: '3.0.0',
    });
  });

  it('fetches the version with the token it just issued, not with store state', async () => {
    // The regression: without an explicit token and Skip-Auth, this request
    // hits the client's proactive-login path and deadlocks against the login
    // that is awaiting it.
    const { client, get } = makeClient();

    await loginV3({ user: 'admin', pass: 'pw' }, client);

    const [, config] = get.mock.calls[0];
    expect(config?.headers?.['Skip-Auth']).toBe('true');
    expect(config?.headers?.Authorization).toBe('Bearer access-abc');
  });

  it('still logs in when the version lookup fails', async () => {
    // Version is display-only; losing it must not cost the user their session.
    const { client } = makeClient({ versionFails: true });

    const login = await loginV3({ user: 'admin', pass: 'pw' }, client);

    expect(login.access_token).toBe('access-abc');
    expect(login.version).toBeUndefined();
  });
});

describe('getVersionV3', () => {
  it('uses the ambient session token when no token is handed to it', async () => {
    // Callers outside the login flow (the assistant's version probe) are
    // already authenticated, so the client attaches the token as usual.
    const { client, get } = makeClient();

    await getVersionV3(client);

    const [, config] = get.mock.calls[0];
    expect(config?.headers?.['Skip-Auth']).toBeUndefined();
  });
});
