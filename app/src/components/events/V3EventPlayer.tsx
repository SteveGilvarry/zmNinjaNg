/**
 * V3EventPlayer - recorded-event playback for zm-api (v3) profiles.
 *
 * v3 events are served as HLS (the event's default_video is an m3u8 and the
 * progressive /video endpoint is not always available), so playback uses hls.js
 * with a Bearer xhrSetup, falling back to native HLS on Safari/iOS. Selected by
 * EventDetail when the active profile's backend is 'zmapi-v3'.
 */

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { useTranslation } from 'react-i18next';
import { v3EventPlaylistUrl, v3EventThumbnailUrl } from '../../lib/v3-url-builder';
import { useAuthStore } from '../../stores/auth';
import type { ProfileId } from '../../api/types';
import { log, LogLevel } from '../../lib/logger';
import { VideoOff } from 'lucide-react';

/**
 * Callers must pass `key={eventId}` so navigating between events remounts the
 * player with fresh error/poster state instead of resetting it from an effect.
 */
export interface V3EventPlayerProps {
  /** The profile owning this event; its token is the one the server accepts. */
  profileId: ProfileId;
  eventId: string;
  baseUrl: string;
  className?: string;
  autoplay?: boolean;
}

export function V3EventPlayer({ profileId, eventId, baseUrl, className = '', autoplay = false }: V3EventPlayerProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState(false);
  const [poster, setPoster] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!eventId || !baseUrl) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let hls: Hls | null = null;

    (async () => {
      const token = await useAuthStore.getState().getFreshAccessToken(profileId);
      if (cancelled) return;

      setPoster(v3EventThumbnailUrl(baseUrl, eventId, token));
      const manifest = v3EventPlaylistUrl(baseUrl, eventId, token);

      // Safari/iOS native HLS (token in the query string).
      if (video.canPlayType('application/vnd.apple.mpegurl') && !Hls.isSupported()) {
        video.src = manifest;
        if (autoplay) video.play().catch(() => { /* ignore */ });
        return;
      }

      if (!Hls.isSupported()) {
        setError(true);
        return;
      }

      hls = new Hls({
        xhrSetup: (xhr) => {
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        },
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          log.api('v3 event HLS fatal error', LogLevel.WARN, { eventId, details: data.details });
          if (!cancelled) setError(true);
        }
      });
      // The manifest already carries ?token=; hls.js also sends the header.
      hls.loadSource(manifest);
      hls.attachMedia(video);
      if (autoplay) {
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => { /* ignore */ }));
      }
    })();

    return () => {
      cancelled = true;
      if (hls) { hls.destroy(); hls = null; }
      if (video) { try { video.removeAttribute('src'); video.load(); } catch { /* ignore */ } }
    };
  }, [profileId, eventId, baseUrl, autoplay]);

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center bg-black/90 text-muted-foreground aspect-video ${className}`}>
        <VideoOff className="w-8 h-8 mb-2" />
        <span className="text-xs">{t('events.playback_failed', 'Playback unavailable')}</span>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className={className}
      style={{ width: '100%', height: '100%' }}
      controls
      playsInline
      poster={poster}
      data-testid="v3-event-video"
    >
      {/* Surveillance recordings carry no caption track. An empty one states
          that explicitly, so assistive tech reports "no captions available"
          rather than leaving the question open. */}
      <track kind="captions" />
    </video>
  );
}
