/**
 * Backend dispatch: every api/*.ts module routes on the client's backend.
 *
 * The whole v3 layer hangs off this one decision. A dispatcher that forgets to
 * branch silently sends v3 traffic to CakePHP paths (or the reverse), which
 * shows up as 404s far from the cause - so each pair is pinned here rather
 * than left to review.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiClient } from '../client';
import { asProfileId, type BackendKind } from '../types';

vi.mock('../legacy/monitors');
vi.mock('../v3/monitors');
vi.mock('../legacy/events');
vi.mock('../v3/events');
vi.mock('../legacy/groups');
vi.mock('../v3/groups');
vi.mock('../legacy/states');
vi.mock('../v3/states');
vi.mock('../legacy/tags');
vi.mock('../v3/tags');
vi.mock('../legacy/server');
vi.mock('../v3/server');

import * as legacyMonitors from '../legacy/monitors';
import * as v3Monitors from '../v3/monitors';
import * as legacyEvents from '../legacy/events';
import * as v3Events from '../v3/events';
import * as legacyGroups from '../legacy/groups';
import * as v3Groups from '../v3/groups';
import * as legacyStates from '../legacy/states';
import * as v3States from '../v3/states';
import * as legacyTags from '../legacy/tags';
import * as v3Tags from '../v3/tags';
import * as legacyServer from '../legacy/server';
import * as v3Server from '../v3/server';

import { getMonitors, getMonitor, setMonitorEnabled } from '../monitors';
import { getEvents, deleteEvent } from '../events';
import { getGroups } from '../groups';
import { changeState } from '../states';
import { getTags } from '../tags';
import { getServers } from '../server';

const profileId = asProfileId('p1');

function clientFor(backend: BackendKind): ApiClient {
  return { backend } as unknown as ApiClient;
}

const legacyClient = clientFor('legacy');
const v3Client = clientFor('zmapi-v3');

/**
 * Each case names the dispatcher, the call, and the two implementations it has
 * to choose between. Asserting on which implementation ran - rather than on a
 * returned value - is the point: the bug this catches is calling the wrong one.
 */
const CASES: Array<{
  name: string;
  call: (client: ApiClient) => unknown;
  legacy: () => { mock: { calls: unknown[][] } };
  v3: () => { mock: { calls: unknown[][] } };
}> = [
  {
    name: 'monitors.getMonitors',
    call: (c) => getMonitors(c, profileId),
    legacy: () => vi.mocked(legacyMonitors.getMonitors),
    v3: () => vi.mocked(v3Monitors.getMonitors),
  },
  {
    name: 'monitors.getMonitor',
    call: (c) => getMonitor(c, '3'),
    legacy: () => vi.mocked(legacyMonitors.getMonitor),
    v3: () => vi.mocked(v3Monitors.getMonitor),
  },
  {
    name: 'monitors.setMonitorEnabled',
    call: (c) => setMonitorEnabled(c, '3', true),
    legacy: () => vi.mocked(legacyMonitors.setMonitorEnabled),
    v3: () => vi.mocked(v3Monitors.setMonitorEnabled),
  },
  {
    name: 'events.getEvents',
    call: (c) => getEvents(c, profileId),
    legacy: () => vi.mocked(legacyEvents.getEvents),
    v3: () => vi.mocked(v3Events.getEvents),
  },
  {
    name: 'events.deleteEvent',
    call: (c) => deleteEvent(c, '9'),
    legacy: () => vi.mocked(legacyEvents.deleteEvent),
    v3: () => vi.mocked(v3Events.deleteEvent),
  },
  {
    name: 'groups.getGroups',
    call: (c) => getGroups(c),
    legacy: () => vi.mocked(legacyGroups.getGroups),
    v3: () => vi.mocked(v3Groups.getGroups),
  },
  {
    name: 'states.changeState',
    call: (c) => changeState(c, 'Restart'),
    legacy: () => vi.mocked(legacyStates.changeState),
    v3: () => vi.mocked(v3States.changeState),
  },
  {
    name: 'tags.getTags',
    call: (c) => getTags(c),
    legacy: () => vi.mocked(legacyTags.getTags),
    v3: () => vi.mocked(v3Tags.getTags),
  },
  {
    name: 'server.getServers',
    call: (c) => getServers(c),
    legacy: () => vi.mocked(legacyServer.getServers),
    v3: () => vi.mocked(v3Server.getServers),
  },
];

describe('backend dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(CASES)('$name uses the legacy implementation for a legacy client', ({ call, legacy, v3 }) => {
    call(legacyClient);

    expect(legacy().mock.calls).toHaveLength(1);
    expect(v3().mock.calls).toHaveLength(0);
  });

  it.each(CASES)('$name uses the v3 implementation for a v3 client', ({ call, legacy, v3 }) => {
    call(v3Client);

    expect(v3().mock.calls).toHaveLength(1);
    expect(legacy().mock.calls).toHaveLength(0);
  });

  it('passes the client through to the implementation it picked', () => {
    getMonitor(v3Client, '3');

    expect(vi.mocked(v3Monitors.getMonitor)).toHaveBeenCalledWith(v3Client, '3');
  });
});
