/**
 * PTZ / controls - v3 (zm-api) implementation.
 *
 * Legacy ZoneMinder PTZ drives a single CGI endpoint with command strings
 * (moveConUp, zoomConTele, presetGoto3, moveStop, ...). zm-api exposes discrete
 * REST endpoints under /api/v3/ptz/monitors/{id}/... . This module:
 *   - getControl(monitorId): maps /ptz/monitors/{id}/status capabilities onto the
 *     legacy ControlData shape PTZControls reads.
 *   - controlMonitor(monitorId, command): translates a ZM command string into the
 *     matching v3 REST call.
 *
 * NOTE: unverified end-to-end - the test server has no PTZ-capable monitor.
 * Implemented to the OpenAPI/handler spec; revisit when a PTZ camera is available.
 */

import type { ApiClient } from '../client';
import type { ControlData } from '../types';
import { log, LogLevel } from '../../lib/logger';

const b = (v: unknown): string => (v ? '1' : '0');

interface AxisCaps { can?: boolean; can_abs?: boolean; can_auto?: boolean; can_con?: boolean; can_rel?: boolean }
interface PanTiltCaps {
  can_move?: boolean; can_move_abs?: boolean; can_move_con?: boolean;
  can_move_diag?: boolean; can_move_rel?: boolean;
}
interface PresetCaps { can_set_presets?: boolean; has_home_preset?: boolean; has_presets?: boolean; num_presets?: number }
interface PtzCaps {
  control_id?: number; name?: string; protocol?: string | null;
  pan_tilt?: PanTiltCaps; zoom?: AxisCaps; focus?: AxisCaps; presets?: PresetCaps;
}

/** Fetch PTZ capabilities for a monitor and map them to the legacy ControlData. */
export async function getControl(client: ApiClient, monitorId: string): Promise<ControlData> {
  const response = await client.get(`/api/v3/ptz/monitors/${monitorId}/status`, {
    intent: `Fetch PTZ capabilities for monitor ${monitorId}`,
  });
  const data = response.data as { capabilities?: PtzCaps; protocol?: string | null };
  const caps = data.capabilities ?? {};
  const pt = caps.pan_tilt ?? {};
  const zoom = caps.zoom ?? {};
  const focus = caps.focus ?? {};
  const presets = caps.presets ?? {};

  return {
    control: {
      Control: {
        Id: String(caps.control_id ?? monitorId),
        Name: caps.name ?? `Monitor ${monitorId}`,
        Type: caps.protocol ?? data.protocol ?? 'Remote',
        Protocol: caps.protocol ?? data.protocol ?? null,
        CanMove: b(pt.can_move),
        CanMoveDiag: b(pt.can_move_diag),
        CanMoveCon: b(pt.can_move_con),
        CanMoveRel: b(pt.can_move_rel),
        CanMoveAbs: b(pt.can_move_abs),
        CanZoom: b(zoom.can),
        CanZoomCon: b(zoom.can_con),
        CanZoomRel: b(zoom.can_rel),
        CanZoomAbs: b(zoom.can_abs),
        CanAutoZoom: b(zoom.can_auto),
        CanFocus: b(focus.can),
        CanFocusCon: b(focus.can_con),
        CanFocusRel: b(focus.can_rel),
        CanFocusAbs: b(focus.can_abs),
        CanAutoFocus: b(focus.can_auto),
        HasPresets: b(presets.has_presets),
        NumPresets: String(presets.num_presets ?? 0),
        HasHomePreset: b(presets.has_home_preset),
      },
    },
  };
}

const DIRECTIONS: Record<string, string> = {
  Up: 'up', Down: 'down', Left: 'left', Right: 'right',
  UpLeft: 'up-left', UpRight: 'up-right', DownLeft: 'down-left', DownRight: 'down-right',
};

/** Translate a ZM PTZ command string into the matching v3 endpoint path (relative to the ptz monitor base), or null if unrecognised. */
export function commandToPath(command: string): string | null {
  if (command === 'moveStop') return 'move/stop';
  if (command === 'zoomStop') return 'zoom/stop';
  if (command === 'presetHome' || command === 'home') return 'home';

  let m = command.match(/^move(?:Con|Rel|Abs)?(Up|Down|Left|Right|UpLeft|UpRight|DownLeft|DownRight)$/);
  if (m) return `move/${DIRECTIONS[m[1]]}`;

  m = command.match(/^zoom(?:Con|Rel|Abs)?(Tele|Wide)$/);
  if (m) return m[1] === 'Tele' ? 'zoom/in' : 'zoom/out';

  m = command.match(/^focus(Near|Far|Auto|Stop)$/);
  if (m) return `focus/${m[1].toLowerCase()}`;

  m = command.match(/^presetGoto(\d+)$/);
  if (m) return `presets/${m[1]}/goto`;

  m = command.match(/^presetSet(\d+)$/);
  if (m) return `presets/${m[1]}/set`;

  return null;
}

export async function controlMonitor(client: ApiClient, monitorId: string, command: string): Promise<void> {
  const path = commandToPath(command);
  if (!path) {
    log.api('Unrecognised v3 PTZ command; ignoring', LogLevel.WARN, { monitorId, command });
    return;
  }
  // PTZ move/zoom/focus requests accept an optional speed/duration body; defaults
  // are server-side, so an empty body is fine.
  await client.post(`/api/v3/ptz/monitors/${monitorId}/${path}`, {}, {
    intent: `PTZ ${command} on monitor ${monitorId}`,
  });
}
