/**
 * States API - backend dispatcher. See api/groups.ts for the pattern.
 */

import type { ApiClient } from './client';
import type { State } from './types';
import * as legacy from './legacy/states';
import * as v3 from './v3/states';

export function getStates(client: ApiClient): Promise<State[]> {
  return client.backend === 'zmapi-v3' ? v3.getStates(client) : legacy.getStates(client);
}

export function changeState(client: ApiClient, stateName: string): Promise<void> {
  return client.backend === 'zmapi-v3'
    ? v3.changeState(client, stateName)
    : legacy.changeState(client, stateName);
}
