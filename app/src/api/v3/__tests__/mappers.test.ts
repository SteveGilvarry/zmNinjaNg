import { describe, it, expect } from 'vitest';
import {
  mapMonitor,
  mapMonitorStatus,
  mapMonitorData,
  mapEvent,
  mapZone,
  mapGroup,
  mapState,
  mapTag,
  mapLog,
  mapConfig,
  mapStorage,
  mapServer,
} from '../mappers';
import {
  MonitorResponseSchema,
  MonitorStatusResponseSchema,
  EventResponseSchema,
  ZoneResponseSchema,
  GroupResponseSchema,
  StateResponseSchema,
  TagResponseSchema,
  LogResponseSchema,
} from '../types';

// A representative v3 MonitorResponse (subset of the real ~150 fields; the schema
// uses .passthrough() so extra fields are fine and omitted optional ones default).
const v3Monitor = {
  id: 7,
  name: 'Front Door',
  notes: 'porch cam',
  deleted: 0,
  server_id: 1,
  storage_id: 2,
  type: 'Ffmpeg',
  function: 'Modect',
  capturing: 'Always',
  analysing: 'Always',
  recording: 'OnMotion',
  width: 1920,
  height: 1080,
  colours: 3,
  orientation: 'ROTATE_0',
  controllable: 1,
  control_id: 4,
  max_fps: 30,
  default_scale: '100',
  web_colour: '#ff9900',
  signal_check_colour: '#0000BE',
  zone_count: 2,
  rtsp_stream_name: 'cam7',
};

describe('mapMonitor (v3 -> app)', () => {
  it('maps core identity and dimensions', () => {
    const m = mapMonitor(MonitorResponseSchema.parse(v3Monitor));
    expect(m.Id).toBe('7');
    expect(m.Name).toBe('Front Door');
    expect(m.Type).toBe('Ffmpeg');
    expect(m.Function).toBe('Modect');
    expect(m.Width).toBe('1920');
    expect(m.Height).toBe('1080');
    expect(m.ServerId).toBe('1');
    expect(m.StorageId).toBe('2');
  });

  it('maps the 1.38 capture model and derives Enabled', () => {
    const m = mapMonitor(MonitorResponseSchema.parse(v3Monitor));
    expect(m.Capturing).toBe('Always');
    expect(m.Analysing).toBe('Always');
    expect(m.Recording).toBe('OnMotion');
    expect(m.Enabled).toBe('1');
  });

  it('derives Enabled=0 when capturing is None', () => {
    const m = mapMonitor(MonitorResponseSchema.parse({ ...v3Monitor, capturing: 'None' }));
    expect(m.Enabled).toBe('0');
  });

  it('maps control fields and falls back for unknown function', () => {
    const m = mapMonitor(MonitorResponseSchema.parse({ ...v3Monitor, function: 'NotSet' }));
    expect(m.Function).toBe('Monitor'); // unknown -> default
    expect(m.Controllable).toBe('1');
    expect(m.ControlId).toBe('4');
  });

  it('handles nulls without throwing', () => {
    const m = mapMonitor(
      MonitorResponseSchema.parse({ ...v3Monitor, notes: null, control_id: null, max_fps: null }),
    );
    expect(m.Notes).toBeNull();
    expect(m.ControlId).toBeNull();
    expect(m.MaxFPS).toBeNull();
  });
});

describe('mapMonitorStatus / mapMonitorData', () => {
  const v3Status = {
    monitor_id: 7,
    status: 'Connected',
    capture_fps: '29.97',
    analysis_fps: '15.0',
    capture_bandwidth: 1048576,
    updated_on: '2026-06-09T10:00:00Z',
  };

  it('maps status fields', () => {
    const s = mapMonitorStatus(MonitorStatusResponseSchema.parse(v3Status));
    expect(s.MonitorId).toBe('7');
    expect(s.Status).toBe('Connected');
    expect(s.CaptureFPS).toBe('29.97');
  });

  it('combines monitor + status into MonitorData', () => {
    const data = mapMonitorData(
      MonitorResponseSchema.parse(v3Monitor),
      MonitorStatusResponseSchema.parse(v3Status),
    );
    expect(data.Monitor.Id).toBe('7');
    expect(data.Monitor_Status?.Status).toBe('Connected');
  });

  it('omits status when not provided', () => {
    const data = mapMonitorData(MonitorResponseSchema.parse(v3Monitor));
    expect(data.Monitor_Status).toBeUndefined();
  });
});

describe('mapEvent (v3 -> app)', () => {
  const v3Event = {
    id: 1234,
    monitor_id: 7,
    storage_id: 1,
    name: 'Event-1234',
    cause: 'Motion',
    start_date_time: '2026-06-09 10:00:00',
    end_date_time: '2026-06-09 10:02:30',
    width: 1920,
    height: 1080,
    length: 150.5,
    frames: 300,
    alarm_frames: 42,
    default_video: '1234-video.mp4',
    tot_score: 999,
    avg_score: 33,
    max_score: 88,
    archived: 1,
    videoed: 1,
    uploaded: 0,
    emailed: 0,
    messaged: 0,
    executed: 0,
    notes: null,
    state_id: 1,
    orientation: 'ROTATE_0',
    scheme: 'Medium',
  };

  it('maps core fields and coerces numbers to strings', () => {
    const e = mapEvent(EventResponseSchema.parse(v3Event));
    expect(e.Id).toBe('1234');
    expect(e.MonitorId).toBe('7');
    expect(e.Cause).toBe('Motion');
    expect(e.StartDateTime).toBe('2026-06-09 10:00:00');
    expect(e.Frames).toBe('300');
    expect(e.MaxScore).toBe('88');
    expect(e.Archived).toBe('1');
    expect(e.DefaultVideo).toBe('1234-video.mp4');
  });

  it('defaults null cause/start to empty strings', () => {
    const e = mapEvent(EventResponseSchema.parse({ ...v3Event, cause: null, start_date_time: null }));
    expect(e.Cause).toBe('');
    expect(e.StartDateTime).toBe('');
  });
});

describe('mapZone / mapGroup / mapState / mapTag / mapLog', () => {
  it('maps a zone, defaulting unknown type to Active', () => {
    const z = mapZone(
      ZoneResponseSchema.parse({
        id: 3,
        monitor_id: 7,
        name: 'Driveway',
        type: 'Active',
        units: 'Percent',
        num_coords: 4,
        coords: '0,0 100,0 100,100 0,100',
      }),
    );
    expect(z.Id).toBe(3);
    expect(z.MonitorId).toBe(7);
    expect(z.Type).toBe('Active');
    expect(z.Coords).toContain('100,100');

    const z2 = mapZone(
      ZoneResponseSchema.parse({ id: 4, monitor_id: 7, name: 'x', type: 'Weird', coords: '0,0' }),
    );
    expect(z2.Type).toBe('Active');
  });

  it('maps a group with parent', () => {
    const g = mapGroup(GroupResponseSchema.parse({ id: 2, name: 'Outside', parent_id: 1 }));
    expect(g.Id).toBe('2');
    expect(g.Name).toBe('Outside');
    expect(g.ParentId).toBe('1');
  });

  it('maps a state', () => {
    const s = mapState(
      StateResponseSchema.parse({ id: 5, name: 'Home', definition: '1:Modect', is_active: 1 }),
    );
    expect(s.Id).toBe('5');
    expect(s.IsActive).toBe('1');
  });

  it('maps a tag', () => {
    const t = mapTag(TagResponseSchema.parse({ id: 9, name: 'person', create_date: '2026-01-01' }));
    expect(t.Id).toBe('9');
    expect(t.Name).toBe('person');
    expect(t.CreateDate).toBe('2026-01-01');
  });

  it('maps a log entry', () => {
    const l = mapLog(
      LogResponseSchema.parse({
        id: 11,
        time_key: 1700000000.123,
        component: 'zmc',
        level: -1,
        code: 'WAR',
        message: 'signal lost',
        file: 'zmc.cpp',
        line: 42,
      }),
    );
    expect(l.Id).toBe(11);
    expect(l.Component).toBe('zmc');
    expect(l.Level).toBe(-1);
    expect(l.TimeKey).toBe('1700000000.123');
  });

  it('maps a config row, defaulting category and stringifying readonly', () => {
    const c = mapConfig({
      id: 35,
      name: 'ZM_ADD_JPEG_COMMENTS',
      value: '0',
      type: 'boolean',
      default_value: 'no',
    });
    expect(c.Id).toBe('35');
    expect(c.Name).toBe('ZM_ADD_JPEG_COMMENTS');
    expect(c.Value).toBe('0');
    expect(c.Category).toBe('config');
    expect(c.Readonly).toBeNull();
  });

  it('maps a storage row to the legacy shape', () => {
    const s = mapStorage({
      id: 1,
      name: 'Default',
      path: '/var/cache/zoneminder/events',
      type: 'local',
      enabled: 1,
    });
    expect(s.Id).toBe('1');
    expect(s.Name).toBe('Default');
    expect(s.Path).toBe('/var/cache/zoneminder/events');
    expect(s.Enabled).toBe(true);
    expect(s.ServerId).toBeNull();
  });

  it('maps a server row to the legacy shape', () => {
    const s = mapServer({ id: 2, name: 'node-2', cpu_load: 1.5 });
    expect(s.Id).toBe('2');
    expect(s.Name).toBe('node-2');
    expect(s.CpuLoad).toBe(1.5);
    expect(s.Hostname).toBeUndefined();
  });
});

describe('orientation normalization', () => {
  /**
   * zm-api serializes the Orientation enum with serde, which emits the Rust
   * variant name ("Rotate90"). ZoneMinder's own column - and sea_orm's
   * string_value for the same variant - is "ROTATE_90", which is what the app's
   * parseMonitorRotation and every other consumer expect. Observed against a
   * live server: 4K cameras with Rotate90 rendered unrotated, because
   * parseInt("ROTATE90") is NaN and the rotation read as unknown.
   */
  const CASES: Array<[string, string]> = [
    ['Rotate0', 'ROTATE_0'],
    ['Rotate90', 'ROTATE_90'],
    ['Rotate180', 'ROTATE_180'],
    ['Rotate270', 'ROTATE_270'],
    ['FlipHori', 'FLIP_HORI'],
    ['FlipVert', 'FLIP_VERT'],
  ];

  it.each(CASES)('maps monitor orientation %s to %s', (from, to) => {
    expect(mapMonitor({ id: 1, name: 'm', orientation: from } as never).Orientation).toBe(to);
  });

  it.each(CASES)('maps event orientation %s to %s', (from, to) => {
    const event = { id: 1, monitor_id: 1, name: 'Event-1', orientation: from };
    expect(mapEvent(event as never).Orientation).toBe(to);
  });

  it('passes through a value that is already canonical', () => {
    expect(mapMonitor({ id: 1, name: 'm', orientation: 'ROTATE_90' } as never).Orientation).toBe(
      'ROTATE_90',
    );
  });

  it('leaves an unrecognized value alone rather than inventing a rotation', () => {
    expect(mapMonitor({ id: 1, name: 'm', orientation: 'Sideways' } as never).Orientation).toBe(
      'Sideways',
    );
  });

  it('keeps a missing orientation null', () => {
    expect(mapMonitor({ id: 1, name: 'm' } as never).Orientation).toBeNull();
  });
});
