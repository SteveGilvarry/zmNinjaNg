/**
 * Mappers: zm-api (v3) DTOs -> the app's existing domain types.
 *
 * v3 returns flat snake_case objects with native number types; the app consumes
 * the legacy CakePHP shapes (PascalCase, mostly string-coerced). Mapping here
 * keeps every hook/component/store unchanged. We build a plain object and run it
 * through the existing Zod schema so number->string coercion and validation are
 * shared with the legacy path.
 */

import {
  MonitorSchema,
  MonitorStatusSchema,
  EventSchema,
  ZoneSchema,
  ZMLogSchema,
  ConfigSchema,
  type Monitor,
  type MonitorData,
  type MonitorStatus,
  type Event as AppEvent,
  type EventData,
  type Zone,
  type Group,
  type State,
  type Tag,
  type ZMLog,
  type Config,
} from '../types';
import type { Server, Storage } from '../legacy/server';
import type {
  MonitorResponse,
  MonitorStatusResponse,
  EventResponse,
  ZoneResponse,
  GroupResponse,
  StateResponse,
  TagResponse,
  LogResponse,
  ConfigResponse,
  StorageResponse,
  ServerResponse,
} from './types';

const FUNCTIONS = ['None', 'Monitor', 'Modect', 'Record', 'Mocord', 'Nodect'] as const;
const CAPTURING = ['None', 'Ondemand', 'Always'] as const;
const ANALYSING = ['None', 'Always'] as const;
const RECORDING = ['None', 'OnMotion', 'Always'] as const;

function pick<T extends string>(allowed: readonly T[], value: unknown): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/**
 * Map a v3 MonitorResponse onto the legacy Monitor shape. v3 has no single
 * Enabled column, so it is derived from capturing (None => disabled). Fields the
 * v3 payload doesn't carry are defaulted to null/0, matching how the legacy API
 * returns optional columns.
 */
/**
 * ZoneMinder's canonical Orientation values, which the app's
 * lib/monitor-rotation.ts parses.
 *
 * zm-api serializes this column with serde, so it emits the Rust variant name
 * ("Rotate90") rather than the value stored in the database and used
 * everywhere else in ZoneMinder ("ROTATE_90"). Left alone, parseMonitorRotation
 * uppercases that to "ROTATE90", finds no "ROTATE_" prefix, and parseInt
 * returns NaN - so the rotation reads as unknown and a rotated camera renders
 * upright. Normalizing here keeps the rest of the app on one spelling.
 *
 * An unrecognized value passes through untouched: inventing a rotation for
 * something we do not understand is worse than rendering it unrotated.
 */
const V3_ORIENTATION_ALIASES: Record<string, string> = {
  rotate0: 'ROTATE_0',
  rotate90: 'ROTATE_90',
  rotate180: 'ROTATE_180',
  rotate270: 'ROTATE_270',
  fliphori: 'FLIP_HORI',
  flipvert: 'FLIP_VERT',
};

function normalizeOrientation(value: string | null | undefined): string | null {
  if (!value) return null;
  return V3_ORIENTATION_ALIASES[value.trim().toLowerCase().replace(/_/g, '')] ?? value;
}

export function mapMonitor(m: MonitorResponse): Monitor {
  const capturing = pick(CAPTURING, m.capturing);
  const enabled = capturing === 'None' || m.deleted === 1 ? '0' : '1';

  const raw = {
    Id: m.id,
    Name: m.name,
    Notes: m.notes ?? null,
    Deleted: m.deleted === 1,
    ServerId: m.server_id ?? null,
    StorageId: m.storage_id ?? null,
    Type: m.type,
    Function: pick(FUNCTIONS, m.function) ?? 'Monitor',
    Capturing: capturing,
    Analysing: pick(ANALYSING, m.analysing),
    Recording: pick(RECORDING, m.recording),
    Enabled: enabled,
    LinkedMonitors: m.linked_monitors ?? null,
    Triggers: m.triggers ?? null,
    Device: null,
    Channel: null,
    Format: null,
    V4LMultiBuffer: null,
    V4LCapturesPerFrame: null,
    Protocol: m.protocol ?? null,
    Method: null,
    Host: m.host ?? null,
    Port: m.port ?? null,
    SubPath: null,
    Path: m.path ?? null,
    Options: null,
    User: null,
    Pass: null,
    Width: m.width,
    Height: m.height,
    Colours: m.colours ?? 3,
    Palette: null,
    Orientation: normalizeOrientation(m.orientation),
    Deinterlacing: null,
    DecoderHWAccelName: null,
    DecoderHWAccelDevice: null,
    SaveJPEGs: null,
    VideoWriter: null,
    EncoderParameters: null,
    RecordAudio: null,
    RTSPDescribe: null,
    Brightness: null,
    Contrast: null,
    Hue: null,
    Colour: null,
    EventPrefix: null,
    LabelFormat: null,
    LabelX: null,
    LabelY: null,
    LabelSize: null,
    ImageBufferCount: 0,
    WarmupCount: 0,
    PreEventCount: 0,
    PostEventCount: 0,
    StreamReplayBuffer: 0,
    AlarmFrameCount: 0,
    SectionLength: 0,
    MinSectionLength: 0,
    FrameSkip: 0,
    MotionFrameSkip: 0,
    AnalysisFPSLimit: null,
    AnalysisUpdateDelay: 0,
    MaxFPS: m.max_fps != null ? String(m.max_fps) : null,
    AlarmMaxFPS: m.alarm_max_fps != null ? String(m.alarm_max_fps) : null,
    FPSReportInterval: 0,
    RefBlendPerc: 0,
    AlarmRefBlendPerc: 0,
    Controllable: m.controllable ?? 0,
    ControlId: m.control_id ?? null,
    ControlDevice: m.control_device ?? null,
    ControlAddress: m.control_address ?? null,
    AutoStopTimeout: null,
    TrackMotion: m.track_motion ?? null,
    TrackDelay: null,
    ReturnLocation: null,
    ReturnDelay: null,
    ModectDuringPTZ: null,
    DefaultRate: m.default_rate ?? 100,
    DefaultScale: m.default_scale ?? '100',
    SignalCheckPoints: null,
    SignalCheckColour: m.signal_check_colour ?? '#0000BE',
    WebColour: m.web_colour ?? '#ff0000',
    Exif: null,
    Sequence: m.sequence ?? null,
    ZoneCount: m.zone_count ?? 0,
    Refresh: null,
    DefaultCodec: null,
    Latitude: null,
    Longitude: null,
    RTSPServer: null,
    RTSPStreamName: m.rtsp_stream_name ?? null,
    Importance: null,
  };

  return MonitorSchema.parse(raw);
}

/** Map a v3 MonitorStatusResponse onto the legacy Monitor_Status shape. */
export function mapMonitorStatus(s: MonitorStatusResponse): MonitorStatus {
  return MonitorStatusSchema.parse({
    MonitorId: s.monitor_id,
    Status: s.status,
    CaptureFPS: s.capture_fps ?? null,
    AnalysisFPS: s.analysis_fps ?? null,
    CaptureBandwidth: s.capture_bandwidth ?? null,
  });
}

/** Combine a v3 monitor + optional status into the app's MonitorData envelope. */
export function mapMonitorData(
  m: MonitorResponse,
  status?: MonitorStatusResponse,
): MonitorData {
  return {
    Monitor: mapMonitor(m),
    Monitor_Status: status ? mapMonitorStatus(status) : undefined,
  };
}

/** Map a v3 EventResponse onto the legacy Event shape. */
export function mapEvent(e: EventResponse): AppEvent {
  return EventSchema.parse({
    Id: e.id,
    MonitorId: e.monitor_id,
    StorageId: e.storage_id ?? null,
    SecondaryStorageId: e.secondary_storage_id ?? null,
    Name: e.name,
    Cause: e.cause ?? '',
    StartDateTime: e.start_date_time ?? '',
    EndDateTime: e.end_date_time ?? null,
    Width: e.width,
    Height: e.height,
    Length: e.length ?? 0,
    Frames: e.frames ?? 0,
    AlarmFrames: e.alarm_frames ?? 0,
    DefaultVideo: e.default_video ?? null,
    SaveJPEGs: e.save_jpe_gs ?? null,
    TotScore: e.tot_score ?? 0,
    AvgScore: e.avg_score ?? 0,
    MaxScore: e.max_score ?? 0,
    Archived: e.archived ?? 0,
    Videoed: e.videoed ?? 0,
    Uploaded: e.uploaded ?? 0,
    Emailed: e.emailed ?? 0,
    Messaged: e.messaged ?? 0,
    Executed: e.executed ?? 0,
    Notes: e.notes ?? null,
    StateId: e.state_id ?? null,
    Orientation: normalizeOrientation(e.orientation),
    DiskSpace: e.disk_space ?? null,
    Scheme: e.scheme ?? null,
  });
}

/** Wrap a v3 event into the app's EventData envelope. */
export function mapEventData(e: EventResponse): EventData {
  return { Event: mapEvent(e) };
}

/** Map a v3 config row onto the legacy Config shape. */
export function mapConfig(c: ConfigResponse): Config {
  return ConfigSchema.parse({
    Id: c.id ?? c.name,
    Name: c.name,
    Value: c.value ?? '',
    Type: c.type ?? 'string',
    DefaultValue: c.default_value ?? null,
    Hint: c.hint ?? null,
    Pattern: c.pattern ?? null,
    Format: c.format ?? null,
    Prompt: c.prompt ?? null,
    Help: c.help ?? null,
    Category: c.category ?? 'config',
    Readonly: c.readonly == null ? null : String(c.readonly),
    Requires: c.requires ?? null,
  });
}

/** Map a v3 storage row onto the legacy Storage shape. */
export function mapStorage(s: StorageResponse): Storage {
  return {
    Id: String(s.id),
    Path: s.path ?? null,
    Name: s.name,
    Type: s.type ?? 'local',
    Url: s.url ?? null,
    DiskSpace: s.disk_space ?? null,
    Scheme: s.scheme ?? null,
    ServerId: s.server_id == null ? null : String(s.server_id),
    Enabled: s.enabled == null ? undefined : Boolean(s.enabled),
    DiskTotalSpace: s.disk_total_space ?? null,
    DiskUsedSpace: s.disk_used_space ?? null,
  };
}

/** Map a v3 server row onto the legacy Server shape. */
export function mapServer(s: ServerResponse): Server {
  return {
    Id: String(s.id),
    Name: s.name,
    Hostname: s.hostname ?? undefined,
    Status: s.status ?? undefined,
    CpuLoad: s.cpu_load ?? undefined,
    TotalMem: s.total_mem ?? undefined,
    FreeMem: s.free_mem ?? undefined,
    Protocol: s.protocol ?? undefined,
    Port: s.port ?? undefined,
  };
}

const ZONE_TYPES = ['Active', 'Inclusive', 'Exclusive', 'Preclusive', 'Inactive', 'Privacy'] as const;

/** Map a v3 ZoneResponse onto the legacy Zone shape. */
export function mapZone(z: ZoneResponse): Zone {
  const type = ZONE_TYPES.includes(z.type as (typeof ZONE_TYPES)[number])
    ? (z.type as (typeof ZONE_TYPES)[number])
    : 'Active';
  return ZoneSchema.parse({
    Id: z.id,
    MonitorId: z.monitor_id,
    Name: z.name,
    Type: type,
    Units: z.units ?? 'Pixels',
    NumCoords: z.num_coords ?? z.coords.split(' ').filter(Boolean).length,
    Coords: z.coords,
    Area: z.area ?? undefined,
    AlarmRGB: z.alarm_rgb ?? undefined,
    CheckMethod: z.check_method ?? undefined,
  });
}

/** Map a v3 GroupResponse onto the legacy Group shape. */
export function mapGroup(g: GroupResponse): Group {
  return {
    Id: String(g.id),
    Name: g.name,
    ParentId: g.parent_id != null ? String(g.parent_id) : null,
  };
}

/** Map a v3 StateResponse onto the legacy State shape. */
export function mapState(s: StateResponse): State {
  return {
    Id: String(s.id),
    Name: s.name,
    Definition: s.definition,
    IsActive: String(s.is_active),
  };
}

/** Map a v3 TagResponse onto the legacy Tag shape. */
export function mapTag(t: TagResponse): Tag {
  return {
    Id: String(t.id),
    Name: t.name,
    CreateDate: t.create_date ?? undefined,
  };
}

/** Map a v3 LogResponse onto the legacy ZMLog shape. */
export function mapLog(l: LogResponse): ZMLog {
  return ZMLogSchema.parse({
    Id: l.id,
    TimeKey: String(l.time_key),
    Component: l.component,
    ServerId: l.server_id ?? null,
    Pid: l.pid ?? null,
    Level: l.level,
    Code: l.code,
    Message: l.message,
    File: l.file ?? null,
    Line: l.line ?? null,
  });
}
