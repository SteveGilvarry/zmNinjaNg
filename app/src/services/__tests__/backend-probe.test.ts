/**
 * Backend detection: what the probe answers, and what a session does with it.
 *
 * The probe is the only thing that decides whether a profile speaks legacy
 * CakePHP or zm-api v3, and every request path downstream branches on that
 * answer, so both the answer and the "unknown profile starts legacy and gets
 * corrected" sequence are pinned here.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { asProfileId, type BackendKind, type Profile, type ProfileId } from '../../api/types';
import { V3_HEALTH_CHECK_PATH } from '../../lib/zm/zm-constants';

const get = vi.fn();

vi.mock('../../api/store-gates', () => ({
  createStoreApiClient: vi.fn(
    (baseURL: string, _reLogin?: () => Promise<boolean>, profileId?: string, backend?: BackendKind) => ({
      __tag: `client:${profileId}:${baseURL}`,
      backend: backend ?? 'legacy',
      get,
    }),
  ),
  resetAuthGates: vi.fn(),
}));

vi.mock('../../api/server', () => ({ getServers: vi.fn(async () => []) }));

vi.mock('../../lib/logger', () => ({
  log: { profileService: vi.fn() },
  LogLevel: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 },
}));

import { probeBackendKind } from '../backend-probe';
import { registerSessionsGate, getSession, hasSession, dropSession, dropAllSessions } from '../sessions';

/** Let the fire-and-forget probe and its follow-up settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe('probeBackendKind', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('reports v3 when the server answers the v3 health check', async () => {
    get.mockResolvedValue({ data: { status: 'ok' } });

    await expect(probeBackendKind('https://api.example')).resolves.toBe('zmapi-v3');
    expect(get).toHaveBeenCalledWith(V3_HEALTH_CHECK_PATH, expect.anything());
  });

  it('reports legacy when the health check route does not exist', async () => {
    get.mockRejectedValue({ status: 404 });

    await expect(probeBackendKind('https://api.example')).resolves.toBe('legacy');
  });

  it('reports legacy rather than throwing when the server is unreachable', async () => {
    get.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(probeBackendKind('https://api.example')).resolves.toBe('legacy');
  });

  it('sends the probe unauthenticated, since health_check runs before any login', async () => {
    get.mockResolvedValue({ data: {} });

    await probeBackendKind('https://api.example');

    const [, config] = get.mock.calls[0];
    expect(config.headers['Skip-Auth']).toBe('true');
  });
});

describe('session backend detection', () => {
  const id = asProfileId('profile-a');
  let profiles: Map<ProfileId, Profile>;

  function makeProfile(overrides: Partial<Profile> = {}): Profile {
    return {
      id,
      name: 'a',
      portalUrl: 'https://portal.example',
      apiUrl: 'https://api.example',
      cgiUrl: '',
      isDefault: false,
      createdAt: 0,
      ...overrides,
    };
  }

  beforeEach(() => {
    get.mockReset();
    dropAllSessions();
    profiles = new Map([[id, makeProfile()]]);
    registerSessionsGate({
      getProfile: (pid) => profiles.get(pid),
      getCurrentProfileId: () => id,
      reLoginFor: () => async () => true,
      setProfileBackend: (pid, backend) => {
        const p = profiles.get(pid);
        if (p) profiles.set(pid, { ...p, backend });
      },
    });
  });

  it('uses the stored backend without probing again', async () => {
    profiles.set(id, makeProfile({ backend: 'zmapi-v3' }));

    const session = getSession(id);

    expect(session.backend).toBe('zmapi-v3');
    expect(session.client.backend).toBe('zmapi-v3');
    await flush();
    // A profile that already knows its backend must not spend a request
    // rediscovering it on every session build.
    expect(get).not.toHaveBeenCalled();
  });

  it('starts an unprobed profile on legacy, then records the probed answer', async () => {
    get.mockResolvedValue({ data: {} });

    // Session is built synchronously, so the first client can only be legacy.
    expect(getSession(id).backend).toBe('legacy');

    await flush();

    expect(profiles.get(id)?.backend).toBe('zmapi-v3');
  });

  it('drops the session when the probe contradicts it, so the client is rebuilt', async () => {
    get.mockResolvedValue({ data: {} });

    getSession(id);
    expect(hasSession(id)).toBe(true);

    await flush();

    // Evicted, so the next getSession builds a client with v3 auth and routing
    // rather than leaving a legacy client pointed at a v3 server.
    expect(hasSession(id)).toBe(false);
    expect(getSession(id).backend).toBe('zmapi-v3');
  });

  it('keeps the session when the probe agrees it is legacy', async () => {
    get.mockRejectedValue({ status: 404 });

    const session = getSession(id);
    await flush();

    expect(profiles.get(id)?.backend).toBe('legacy');
    expect(hasSession(id)).toBe(true);
    expect(getSession(id)).toBe(session);
  });

  it('probes once when the session is rebuilt while a probe is still in flight', async () => {
    // A profile edit (or any dropSession) between the probe firing and
    // resolving would otherwise have the rebuilt session fire a second probe
    // against the same still-unprobed profile.
    let resolveProbe: (value: unknown) => void = () => {};
    get.mockReturnValue(new Promise((resolve) => { resolveProbe = resolve; }));

    getSession(id);
    expect(get).toHaveBeenCalledTimes(1);

    dropSession(id);
    getSession(id);
    expect(get).toHaveBeenCalledTimes(1);

    resolveProbe({ data: {} });
    await flush();

    expect(profiles.get(id)?.backend).toBe('zmapi-v3');
  });
});
