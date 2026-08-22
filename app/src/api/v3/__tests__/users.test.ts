/**
 * Reading the logged-in account's permissions off /api/v3/me.
 *
 * v3 answers the question legacy cannot: /me is readable by any authenticated
 * account, so an operator with System:None still learns its own Monitors and
 * Stream levels instead of leaving every column unknown.
 */

import { describe, it, expect, vi } from 'vitest';
import { createHttpError } from '../../../lib/http/types';
import { UNRESTRICTED_PERMISSIONS } from '../../../lib/permissions/zm-permissions';
import { fetchAccountPermissionsV3 } from '../users';
import type { ApiClient } from '../../client';

/** The account row as zm-api serializes it under MeResponse. */
function me(overrides: Record<string, string> = {}) {
  return {
    user: {
      id: 2,
      username: 'viewer',
      name: 'Viewer',
      email: '',
      phone: '',
      enabled: 1,
      api_enabled: 1,
      home_view: '',
      system: 'None',
      monitors: 'View',
      stream: 'View',
      events: 'View',
      control: 'None',
      groups: 'View',
      devices: 'None',
      snapshots: 'None',
      ...overrides,
    },
    issued_at: 0,
    expires_at: 0,
    token_type: 'access',
  };
}

function clientReturning(data: unknown): ApiClient {
  return { backend: 'zmapi-v3', get: vi.fn().mockResolvedValue({ data }) } as unknown as ApiClient;
}

function clientRejecting(error: unknown): ApiClient {
  return { backend: 'zmapi-v3', get: vi.fn().mockRejectedValue(error) } as unknown as ApiClient;
}

describe('fetchAccountPermissionsV3', () => {
  it('reads the six columns the app gates on', async () => {
    await expect(fetchAccountPermissionsV3(clientReturning(me()), 'viewer')).resolves.toEqual({
      system: 'None',
      monitors: 'View',
      stream: 'View',
      events: 'View',
      control: 'None',
      groups: 'View',
    });
  });

  it('reports the real levels for an account with no system access', async () => {
    // The case legacy gets wrong: users.json refuses this account entirely, so
    // CakePHP can only infer System:None and leaves Monitors unknown.
    const client = clientReturning(me({ system: 'None', monitors: 'Edit' }));

    await expect(fetchAccountPermissionsV3(client, 'viewer')).resolves.toMatchObject({
      system: 'None',
      monitors: 'Edit',
    });
  });

  it('does not match rows by username: the server names the caller', async () => {
    // The token decides whose row comes back, so a profile whose stored
    // username drifted from the account still gets its own permissions
    // rather than the undefined legacy falls back to.
    const client = clientReturning(me({ username: 'renamed' }));

    await expect(fetchAccountPermissionsV3(client, 'stale-name')).resolves.toMatchObject({
      monitors: 'View',
    });
  });

  it('treats a profile with no username as an auth-disabled server', async () => {
    const client = clientReturning(me());

    await expect(fetchAccountPermissionsV3(client, undefined)).resolves.toEqual(
      UNRESTRICTED_PERMISSIONS,
    );
    expect(client.get).not.toHaveBeenCalled();
  });

  it('reports an unrecognized level as unknown rather than as a denial', async () => {
    const client = clientReturning(me({ monitors: 'Superuser' }));

    await expect(fetchAccountPermissionsV3(client, 'viewer')).resolves.toMatchObject({
      monitors: undefined,
    });
  });

  it('rethrows a 401 instead of reading it as System:None', async () => {
    // /me is not System-gated, so a refusal here means the session is broken,
    // not that the account lacks system access. Reading it the legacy way
    // would gate the UI on a permission the account may well have.
    const client = clientRejecting(createHttpError(401, 'Unauthorized', {}, {}));

    await expect(fetchAccountPermissionsV3(client, 'viewer')).rejects.toBeDefined();
  });
});
