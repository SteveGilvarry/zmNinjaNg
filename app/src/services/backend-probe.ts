/**
 * Backend detection.
 *
 * A profile talks to either the classic CakePHP API ('legacy') or the Rust
 * zm-api shipping as ZoneMinder API v3 ('zmapi-v3'). The two speak different
 * auth (query token vs JWT Bearer), different paths, and different streaming
 * stacks, so every request path needs to know which one it is talking to.
 *
 * Rather than ask the user, we probe: v3 exposes an unauthenticated
 * /api/v3/server/health_check that legacy servers do not have. A 2xx means v3;
 * anything else - 404, connection refused, an HTML error page - means legacy.
 * The answer is cached on the profile record (Profile.backend), so a server is
 * probed once and every later session builds its client synchronously from the
 * stored value.
 *
 * The probe deliberately builds its own client instead of going through the
 * session registry: the registry needs the backend kind to build a session, so
 * using a session here would be circular. This is the same sanctioned pre-save
 * probe path ProfileForm uses (see the Sessions contract in AGENTS.project.md).
 */

import { createStoreApiClient } from '../api/store-gates';
import { PROBE_PROFILE_ID, type BackendKind } from '../api/types';
import { log, LogLevel } from '../lib/logger';
import { V3_HEALTH_CHECK_PATH } from '../lib/zm/zm-constants';

/**
 * Ask a server which backend it is.
 *
 * Never throws: an unreachable server answers 'legacy', which is also the
 * behaviour every pre-v3 profile already had.
 */
export async function probeBackendKind(baseUrl: string): Promise<BackendKind> {
  try {
    const client = createStoreApiClient(baseUrl, undefined, PROBE_PROFILE_ID, 'zmapi-v3');
    await client.get(V3_HEALTH_CHECK_PATH, {
      intent: 'Probe for zm-api v3',
      headers: { 'Skip-Auth': 'true' },
      
      // A legacy server has no such route; that 404 is the answer, not an error.
      expectedStatuses: [404],
    });
    log.profileService('Backend probe found zm-api v3', LogLevel.INFO, { baseUrl });
    return 'zmapi-v3';
  } catch (error) {
    log.profileService('Backend probe found no zm-api v3; assuming legacy', LogLevel.DEBUG, {
      baseUrl,
      error,
    });
    return 'legacy';
  }
}
