/**
 * The v3 live player's stream-permission gate.
 *
 * Mirrors the legacy player's behaviour (LiveMonitorPlayer.test.tsx): a denied
 * stream explains itself rather than showing a tile that can never load, and
 * an unknown permission never withholds video. v3 is the backend where this
 * actually bites, because /api/v3/me reports Stream for every account - on
 * legacy the column is usually unknown and the gate stays open.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Monitor, Profile } from '../../../api/types';
import { asProfileId } from '../../../api/types';
import type { ZmPermissionLevel } from '../../../lib/permissions/zm-permissions';

let mockStreamPermission: ZmPermissionLevel | undefined;

vi.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    permissions: mockStreamPermission ? { stream: mockStreamPermission } : undefined,
    isLoading: false,
  }),
}));

/** Records whether the stream hook was asked to run. */
const streamCalls: Array<{ enabled: boolean }> = [];

vi.mock('../../../hooks/useV3LiveStream', () => ({
  useV3LiveStream: (opts: { enabled?: boolean }) => {
    streamCalls.push({ enabled: opts.enabled !== false });
    return { status: 'hls', protocol: 'HLS', error: null };
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

import { V3LiveMonitorPlayer } from '../V3LiveMonitorPlayer';

const monitor = { Id: '3', Name: 'Front Door', Width: '1920', Height: '1080' } as unknown as Monitor;

const profile = {
  id: asProfileId('p1'),
  name: 'v3',
  backend: 'zmapi-v3',
  portalUrl: 'https://api.example',
  apiUrl: 'https://api.example',
  cgiUrl: '',
  isDefault: true,
  createdAt: 0,
} as Profile;

describe('V3LiveMonitorPlayer stream permission', () => {
  beforeEach(() => {
    streamCalls.length = 0;
  });

  afterEach(() => {
    mockStreamPermission = undefined;
  });

  it('explains the refusal instead of showing a tile that can never load', () => {
    mockStreamPermission = 'None';

    render(<V3LiveMonitorPlayer monitor={monitor} profile={profile} />);

    expect(screen.getByTestId('v3-video-player-no-permission')).toBeInTheDocument();
    expect(screen.queryByTestId('v3-live-video')).not.toBeInTheDocument();
  });

  it('does not open a live session the server will refuse', () => {
    mockStreamPermission = 'None';

    render(<V3LiveMonitorPlayer monitor={monitor} profile={profile} />);

    expect(streamCalls.every((call) => call.enabled === false)).toBe(true);
  });

  it('streams normally when the account may stream', () => {
    mockStreamPermission = 'View';

    render(<V3LiveMonitorPlayer monitor={monitor} profile={profile} />);

    expect(screen.queryByTestId('v3-video-player-no-permission')).not.toBeInTheDocument();
    expect(screen.getByTestId('v3-live-video')).toBeInTheDocument();
  });

  it('streams while the permission is still unknown', () => {
    // Unknown must never withhold video: an account that can stream would lose
    // it for no reason.
    render(<V3LiveMonitorPlayer monitor={monitor} profile={profile} />);

    expect(screen.queryByTestId('v3-video-player-no-permission')).not.toBeInTheDocument();
    expect(screen.getByTestId('v3-live-video')).toBeInTheDocument();
  });
});
