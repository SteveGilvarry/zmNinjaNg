/**
 * Zod schemas for the zm-api (ZoneMinder API v3) responses.
 *
 * These mirror the relevant `components.schemas` from the live OpenAPI spec
 * (http://<server>/api-docs/openapi.json). v3 DTOs are flat snake_case objects;
 * api/v3/mappers.ts converts them into the app's existing domain types so the
 * rest of the app is unchanged.
 */

import { z } from 'zod';

// ── Auth ────────────────────────────────────────────────────────────────────

export const TokenResponseSchema = z.object({
  token_type: z.string(),
  access_token: z.string(),
  refresh_token: z.string(),
  expire_in: z.coerce.number(),
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const V3VersionResponseSchema = z.object({
  version: z.string(),
  api_version: z.string(),
  db_version: z.string(),
});
export type V3VersionResponse = z.infer<typeof V3VersionResponseSchema>;

// ── Pagination envelope ───────────────────────────────────────────────────────

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.coerce.number(),
    per_page: z.coerce.number(),
    current_page: z.coerce.number(),
    last_page: z.coerce.number(),
  });
}

// ── Error envelope ────────────────────────────────────────────────────────────

export const AppResponseErrorSchema = z.object({
  kind: z.string(),
  error_message: z.string(),
  code: z.number().nullable().optional(),
  details: z.array(z.array(z.string())).optional(),
});
export type AppResponseError = z.infer<typeof AppResponseErrorSchema>;

// ── Monitor ───────────────────────────────────────────────────────────────────
// Only the fields the app consumes are declared as required-ish; the rest of the
// rich v3 payload is allowed through via .passthrough() so we never reject on
// unmapped fields.

export const MonitorResponseSchema = z
  .object({
    id: z.coerce.number(),
    name: z.string(),
    notes: z.string().nullable().optional(),
    deleted: z.coerce.number().optional(),
    server_id: z.coerce.number().nullable().optional(),
    storage_id: z.coerce.number().nullable().optional(),
    type: z.string(),
    function: z.string(),
    capturing: z.string().optional(),
    analysing: z.string().optional(),
    recording: z.string().optional(),
    // v3 has no single Enabled column; derive from capturing != 'None'.
    width: z.coerce.number(),
    height: z.coerce.number(),
    colours: z.coerce.number().optional(),
    orientation: z.string().nullable().optional(),
    controllable: z.coerce.number().optional(),
    control_id: z.coerce.number().nullable().optional(),
    control_device: z.string().nullable().optional(),
    control_address: z.string().nullable().optional(),
    track_motion: z.coerce.number().nullable().optional(),
    linked_monitors: z.string().nullable().optional(),
    triggers: z.string().nullable().optional(),
    host: z.string().nullable().optional(),
    port: z.string().nullable().optional(),
    path: z.string().nullable().optional(),
    protocol: z.string().nullable().optional(),
    max_fps: z.union([z.string(), z.number()]).nullable().optional(),
    alarm_max_fps: z.union([z.string(), z.number()]).nullable().optional(),
    default_rate: z.coerce.number().optional(),
    default_scale: z.union([z.string(), z.number()]).optional(),
    web_colour: z.string().optional(),
    signal_check_colour: z.string().optional(),
    sequence: z.coerce.number().nullable().optional(),
    zone_count: z.coerce.number().optional(),
  })
  .passthrough();
export type MonitorResponse = z.infer<typeof MonitorResponseSchema>;

export const PaginatedMonitorsResponseSchema = paginated(MonitorResponseSchema);
export type PaginatedMonitorsResponse = z.infer<typeof PaginatedMonitorsResponseSchema>;

export const MonitorStatusResponseSchema = z
  .object({
    monitor_id: z.coerce.number(),
    status: z.string(),
    capture_fps: z.union([z.string(), z.number()]).optional(),
    analysis_fps: z.union([z.string(), z.number()]).optional(),
    capture_bandwidth: z.coerce.number().optional(),
    updated_on: z.string().nullable().optional(),
  })
  .passthrough();
export type MonitorStatusResponse = z.infer<typeof MonitorStatusResponseSchema>;

export const PaginatedMonitorStatusesResponseSchema = paginated(MonitorStatusResponseSchema);

// ── Live streaming ────────────────────────────────────────────────────────────

export const StartLiveResponseSchema = z.object({
  monitor_id: z.coerce.number(),
  status: z.string(),
  hls_playlist: z.string().nullable().optional(),
  webrtc_signaling: z.string().nullable().optional(),
});
export type StartLiveResponse = z.infer<typeof StartLiveResponseSchema>;

// ── Event ─────────────────────────────────────────────────────────────────────

export const EventResponseSchema = z
  .object({
    id: z.coerce.number(),
    monitor_id: z.coerce.number(),
    storage_id: z.coerce.number().nullable().optional(),
    secondary_storage_id: z.coerce.number().nullable().optional(),
    name: z.string(),
    cause: z.string().nullable().optional(),
    start_date_time: z.string().nullable().optional(),
    end_date_time: z.string().nullable().optional(),
    width: z.coerce.number(),
    height: z.coerce.number(),
    length: z.union([z.string(), z.number()]).nullable().optional(),
    frames: z.coerce.number().nullable().optional(),
    alarm_frames: z.coerce.number().nullable().optional(),
    default_video: z.string().nullable().optional(),
    save_jpe_gs: z.coerce.number().nullable().optional(),
    tot_score: z.coerce.number().nullable().optional(),
    avg_score: z.coerce.number().nullable().optional(),
    max_score: z.coerce.number().nullable().optional(),
    archived: z.coerce.number().nullable().optional(),
    videoed: z.coerce.number().nullable().optional(),
    uploaded: z.coerce.number().nullable().optional(),
    emailed: z.coerce.number().nullable().optional(),
    messaged: z.coerce.number().nullable().optional(),
    executed: z.coerce.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    state_id: z.coerce.number().nullable().optional(),
    orientation: z.string().nullable().optional(),
    disk_space: z.coerce.number().nullable().optional(),
    scheme: z.string().nullable().optional(),
  })
  .passthrough();
export type EventResponse = z.infer<typeof EventResponseSchema>;

export const PaginatedEventsResponseSchema = paginated(EventResponseSchema);
export type PaginatedEventsResponse = z.infer<typeof PaginatedEventsResponseSchema>;

export const MonitorEventCountSchema = z.object({
  monitor_id: z.coerce.number(),
  count: z.coerce.number(),
});
export const EventCountsByMonitorResponseSchema = z.object({
  counts: z.array(MonitorEventCountSchema),
  hours: z.coerce.number(),
});

// ── Zones / Groups / States / Tags ────────────────────────────────────────────

export const ZoneResponseSchema = z
  .object({
    id: z.coerce.number(),
    monitor_id: z.coerce.number(),
    name: z.string(),
    type: z.string(),
    units: z.string().nullable().optional(),
    num_coords: z.coerce.number().nullable().optional(),
    coords: z.string(),
    area: z.coerce.number().nullable().optional(),
    alarm_rgb: z.coerce.number().nullable().optional(),
    check_method: z.string().nullable().optional(),
  })
  .passthrough();
export type ZoneResponse = z.infer<typeof ZoneResponseSchema>;
export const PaginatedZonesResponseSchema = paginated(ZoneResponseSchema);

export const GroupResponseSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  parent_id: z.coerce.number().nullable().optional(),
});
export type GroupResponse = z.infer<typeof GroupResponseSchema>;
export const PaginatedGroupsResponseSchema = paginated(GroupResponseSchema);

export const GroupMonitorResponseSchema = z.object({
  id: z.coerce.number(),
  group_id: z.coerce.number(),
  monitor_id: z.coerce.number(),
});
export type GroupMonitorResponse = z.infer<typeof GroupMonitorResponseSchema>;
export const PaginatedGroupMonitorsResponseSchema = paginated(GroupMonitorResponseSchema);

export const StateResponseSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  definition: z.string(),
  is_active: z.coerce.number(),
});
export type StateResponse = z.infer<typeof StateResponseSchema>;
export const PaginatedStatesResponseSchema = paginated(StateResponseSchema);

export const TagResponseSchema = z
  .object({
    id: z.coerce.number(),
    name: z.string(),
    create_date: z.string().nullable().optional(),
    event_count: z.coerce.number().nullable().optional(),
  })
  .passthrough();
export type TagResponse = z.infer<typeof TagResponseSchema>;
export const PaginatedTagsResponseSchema = paginated(TagResponseSchema);

// Per-event tag association (/api/v3/events-tags). Only carries the id pair;
// the tag's name/details are resolved from the /tags collection.
export const EventTagResponseSchema = z
  .object({
    tag_id: z.coerce.number(),
    event_id: z.coerce.number(),
    assigned_by: z.coerce.number().nullable().optional(),
    assigned_date: z.string().nullable().optional(),
  })
  .passthrough();
export type EventTagResponse = z.infer<typeof EventTagResponseSchema>;
export const PaginatedEventTagsResponseSchema = paginated(EventTagResponseSchema);

export const LogResponseSchema = z
  .object({
    id: z.coerce.number(),
    time_key: z.union([z.string(), z.number()]),
    component: z.string(),
    server_id: z.coerce.number().nullable().optional(),
    pid: z.coerce.number().nullable().optional(),
    level: z.coerce.number(),
    code: z.string(),
    message: z.string(),
    file: z.string().nullable().optional(),
    line: z.coerce.number().nullable().optional(),
  })
  .passthrough();
export type LogResponse = z.infer<typeof LogResponseSchema>;
export const PaginatedLogsResponseSchema = paginated(LogResponseSchema);

// ── System status (load / disk / memory) ───────────────────────────────────────
export const SystemStatsSchema = z
  .object({
    cpu_load: z.coerce.number().optional(),
    cpu_usage_percent: z.coerce.number().optional(),
    total_mem: z.coerce.number().optional(),
    free_mem: z.coerce.number().optional(),
    total_swap: z.coerce.number().optional(),
    free_swap: z.coerce.number().optional(),
    total_disk: z.coerce.number().optional(),
    used_disk: z.coerce.number().optional(),
    free_disk: z.coerce.number().optional(),
    disk_usage_percent: z.coerce.number().optional(),
  })
  .passthrough();
export type SystemStats = z.infer<typeof SystemStatsSchema>;

export const SystemStatusResponseSchema = z
  .object({
    running: z.boolean().optional(),
    stats: SystemStatsSchema.optional(),
  })
  .passthrough();
export type SystemStatusResponse = z.infer<typeof SystemStatusResponseSchema>;

// ── Configs ─────────────────────────────────────────────────────────────────────
export const ConfigResponseSchema = z
  .object({
    id: z.coerce.number().optional(),
    name: z.string(),
    value: z.coerce.string().optional(),
    type: z.string().optional(),
    default_value: z.string().nullable().optional(),
    hint: z.string().nullable().optional(),
    pattern: z.string().nullable().optional(),
    format: z.string().nullable().optional(),
    prompt: z.string().nullable().optional(),
    help: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    readonly: z.union([z.string(), z.number(), z.boolean()]).nullable().optional(),
    requires: z.string().nullable().optional(),
  })
  .passthrough();
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>;
export const PaginatedConfigsResponseSchema = paginated(ConfigResponseSchema);

// ── Storage ─────────────────────────────────────────────────────────────────────
export const StorageResponseSchema = z
  .object({
    id: z.coerce.number(),
    name: z.string(),
    path: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    enabled: z.union([z.boolean(), z.number()]).nullable().optional(),
    server_id: z.coerce.number().nullable().optional(),
    scheme: z.string().nullable().optional(),
    disk_space: z.coerce.number().nullable().optional(),
    disk_total_space: z.coerce.number().nullable().optional(),
    disk_used_space: z.coerce.number().nullable().optional(),
  })
  .passthrough();
export type StorageResponse = z.infer<typeof StorageResponseSchema>;
export const PaginatedStorageResponseSchema = paginated(StorageResponseSchema);

// ── Servers ─────────────────────────────────────────────────────────────────────
export const ServerResponseSchema = z
  .object({
    id: z.coerce.number(),
    name: z.string(),
    hostname: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    cpu_load: z.coerce.number().nullable().optional(),
    total_mem: z.coerce.number().nullable().optional(),
    free_mem: z.coerce.number().nullable().optional(),
    protocol: z.string().nullable().optional(),
    port: z.coerce.number().nullable().optional(),
  })
  .passthrough();
export type ServerResponse = z.infer<typeof ServerResponseSchema>;
export const PaginatedServersResponseSchema = paginated(ServerResponseSchema);

// ── Me (the caller's own account) ────────────────────────────────────────────
/**
 * The permission columns on a ZoneMinder Users row, as zm-api serializes them.
 * Each is the enum's name - "None" / "View" / "Edit" / "Create" - so the same
 * strings legacy's users.json returns. Left as plain strings here and narrowed
 * by parsePermissionLevel, which reports anything unrecognized as unknown
 * rather than letting a new level read as a denial.
 */
export const MeUserResponseSchema = z
  .object({
    id: z.coerce.number(),
    username: z.string(),
    system: z.string().nullable().optional(),
    monitors: z.string().nullable().optional(),
    stream: z.string().nullable().optional(),
    events: z.string().nullable().optional(),
    control: z.string().nullable().optional(),
    groups: z.string().nullable().optional(),
    devices: z.string().nullable().optional(),
    snapshots: z.string().nullable().optional(),
  })
  .passthrough();
export type MeUserResponse = z.infer<typeof MeUserResponseSchema>;

export const MeResponseSchema = z
  .object({
    user: MeUserResponseSchema,
  })
  .passthrough();
export type MeResponse = z.infer<typeof MeResponseSchema>;
