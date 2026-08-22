/**
 * Groups API - v3 (zm-api) implementation.
 *
 * v3 splits groups and their monitor membership across /groups and
 * /groups-monitors; this merges them into the legacy GroupsResponse shape.
 */

import type { ApiClient } from '../client';
import type { GroupsResponse, GroupData } from '../types';
import {
  PaginatedGroupsResponseSchema,
  PaginatedGroupMonitorsResponseSchema,
} from './types';
import { mapGroup } from './mappers';
import { log, LogLevel } from '../../lib/logger';

export async function getGroups(client: ApiClient): Promise<GroupsResponse> {
  const response = await client.get('/api/v3/groups', {
    intent: 'Fetch groups list',
    params: { page: 1, page_size: 500 },
  });
  const groups = PaginatedGroupsResponseSchema.parse(response.data);

  // Membership map: group id -> monitor ids (best-effort).
  const membership = new Map<number, string[]>();
  try {
    const gmResp = await client.get('/api/v3/groups-monitors', {
      intent: 'Fetch group memberships',
      params: { page: 1, page_size: 1000 },
    });
    const gm = PaginatedGroupMonitorsResponseSchema.parse(gmResp.data);
    for (const { group_id, monitor_id } of gm.items) {
      const list = membership.get(group_id) ?? [];
      list.push(String(monitor_id));
      membership.set(group_id, list);
    }
  } catch (error) {
    log.api('Failed to fetch v3 group memberships; groups will be empty', LogLevel.DEBUG, { error });
  }

  const groupData: GroupData[] = groups.items.map((g) => ({
    Group: mapGroup(g),
    Monitor: (membership.get(g.id) ?? []).map((id) => ({ Id: id })),
  }));

  return { groups: groupData };
}
