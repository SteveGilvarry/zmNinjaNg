/**
 * V3LiveMonitorPlayer - live view for zm-api (v3) profiles.
 *
 * Renders a single <video> driven by useV3LiveStream (WebRTC-first, HLS
 * fallback). Selected by LiveMonitorPlayer when the active profile's backend is
 * 'zmapi-v3'; the legacy ZMS/go2rtc player is untouched.
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Monitor, Profile } from '../../api/types';
import { PROBE_PROFILE_ID } from '../../api/types';
import { useV3LiveStream } from '../../hooks/useV3LiveStream';
import { getRotatedMediaStyle } from '../../lib/monitor-rotation';
import { VideoOff } from 'lucide-react';

export interface V3LiveMonitorPlayerProps {
  monitor: Monitor;
  profile: Profile | null;
  className?: string;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  showControls?: boolean;
  externalMediaRef?: React.RefObject<HTMLImageElement | HTMLVideoElement | null>;
  muted?: boolean;
  onLoad?: () => void;
  onProtocolChange?: (protocol: string) => void;
}

export function V3LiveMonitorPlayer({
  monitor,
  profile,
  className = '',
  objectFit = 'contain',
  showControls = false,
  externalMediaRef,
  muted = true,
  onLoad,
  onProtocolChange,
}: V3LiveMonitorPlayerProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const baseUrl = profile?.apiUrl ?? '';

  const { status, protocol, error } = useV3LiveStream({
    // The owning profile, not the current one: an All-mode montage tile streams
    // from the server its monitor belongs to.
    profileId: profile?.id ?? PROBE_PROFILE_ID,
    monitorId: monitor.Id,
    baseUrl,
    videoRef,
    enabled: !!baseUrl && !!profile,
  });

  // Surface the chosen protocol and a load signal to the parent.
  useEffect(() => {
    if (protocol) onProtocolChange?.(protocol);
  }, [protocol, onProtocolChange]);

  useEffect(() => {
    if (status === 'webrtc' || status === 'hls') onLoad?.();
  }, [status, onLoad]);

  // Keep an external media ref (used by montage/fullscreen) in sync.
  useEffect(() => {
    if (externalMediaRef) externalMediaRef.current = videoRef.current;
  }, [externalMediaRef]);

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center bg-black/90 text-muted-foreground ${className}`}>
        <VideoOff className="w-8 h-8 mb-2" />
        <span className="text-xs">{t('monitors.stream_failed', 'Stream unavailable')}</span>
      </div>
    );
  }

  // Apply the monitor's Orientation (e.g. ROTATE_90) so rotated cameras display
  // upright, filling the container.
  const { container, media } = getRotatedMediaStyle(monitor.Orientation, objectFit);

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ width: '100%', height: '100%', ...container }}>
      <video
        ref={videoRef}
        style={media}
        muted={muted}
        autoPlay
        playsInline
        controls={showControls}
        data-testid="v3-live-video"
        data-stream-status={status}
      >
        {/* A live camera has no captions; the empty track says so explicitly.
            See V3EventPlayer for the same reasoning. */}
        <track kind="captions" />
      </video>
    </div>
  );
}
