/**
 * useV3LiveStream - drives a zm-api (v3) live view into a <video> element.
 *
 * WebRTC-first with HLS fallback (see api/v3/STREAMING.md):
 *   1. POST /live/{id}/start to spin up the session.
 *   2. Open the WebRTC signaling socket; if no video frame arrives within the
 *      timeout (or it errors), tear it down and fall back to HLS.
 *   3. HLS via hls.js (Bearer header) where supported, native HLS otherwise.
 *   4. DELETE /live/{id}/stop on teardown.
 */

import { useEffect, useState } from 'react';
import Hls from 'hls.js';
import { acquireLiveSession, releaseLiveSession } from '../lib/v3-live-session';
import { connectV3WebRTC, type V3WebRTCHandle } from '../lib/v3-webrtc';
import { v3WebSocketUrl, v3HlsManifestUrl, withToken } from '../lib/v3-url-builder';
import { useAuthStore } from '../stores/auth';
import { getSession } from '../services/sessions';
import type { ProfileId } from '../api/types';
import { log, LogLevel } from '../lib/logger';
import {
  V3_WEBRTC_CONNECT_TIMEOUT_S,
  V3_WEBRTC_FRAME_TIMEOUT_S,
  V3_WEBRTC_FRAME_POLL_MS,
} from '../lib/zmninja-ng-constants';

export type V3StreamStatus = 'idle' | 'connecting' | 'webrtc' | 'hls' | 'error';

export interface UseV3LiveStreamOptions {
  /**
   * The profile owning this monitor. Explicit rather than "current" because a
   * montage tile in All mode belongs to a profile that may not be the current
   * one, and the stream has to reach that profile's server.
   */
  profileId: ProfileId;
  monitorId: string;
  baseUrl: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled?: boolean;
}

export interface UseV3LiveStreamResult {
  status: V3StreamStatus;
  protocol: 'WebRTC' | 'HLS' | null;
  error: string | null;
}

export function useV3LiveStream({
  profileId,
  monitorId,
  baseUrl,
  videoRef,
  enabled = true,
}: UseV3LiveStreamOptions): UseV3LiveStreamResult {
  const [status, setStatus] = useState<V3StreamStatus>('idle');
  const [protocol, setProtocol] = useState<'WebRTC' | 'HLS' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !monitorId || !baseUrl) return;

    let cancelled = false;
    let webrtc: V3WebRTCHandle | null = null;
    let hls: Hls | null = null;
    let frameTimer: ReturnType<typeof setTimeout> | null = null;
    let framePoll: ReturnType<typeof setInterval> | null = null;
    let sessionStarted = false;

    const video = videoRef.current;
    if (!video) return;

    const clearFrameTimer = () => {
      if (frameTimer) { clearTimeout(frameTimer); frameTimer = null; }
      if (framePoll) { clearInterval(framePoll); framePoll = null; }
    };

    const startHlsFallback = async () => {
      if (cancelled) return;
      clearFrameTimer();
      webrtc?.close();
      webrtc = null;

      const token = await useAuthStore.getState().getFreshAccessToken(profileId);
      if (cancelled) return;
      const hlsPath = `/api/v3/live/${monitorId}/hls/live.m3u8`;

      setProtocol('HLS');
      setStatus('hls');

      // Safari/iOS play HLS natively; token must ride in the query string there.
      if (video.canPlayType('application/vnd.apple.mpegurl') && !Hls.isSupported()) {
        video.src = v3HlsManifestUrl(baseUrl, hlsPath, token);
        video.play().catch(() => { /* autoplay may require mute; video is muted */ });
        return;
      }

      if (!Hls.isSupported()) {
        setStatus('error');
        setError('HLS is not supported in this environment');
        return;
      }

      hls = new Hls({
        lowLatencyMode: true,
        // Attach the bearer token to playlist + segment requests.
        xhrSetup: (xhr) => {
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        },
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          log.api('v3 HLS fatal error', LogLevel.WARN, { type: data.type, details: data.details });
          if (!cancelled) { setStatus('error'); setError('HLS playback failed'); }
        }
      });
      hls.loadSource(v3HlsManifestUrl(baseUrl, hlsPath));
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => { /* muted autoplay */ });
      });
    };

    const tryWebRTC = (signalingPath: string, token: string | null) => {
      // The /webrtc/ws upgrade is auth-gated; a browser WebSocket can't send an
      // Authorization header, so the JWT must ride in the query string.
      const wsUrl = withToken(v3WebSocketUrl(baseUrl, signalingPath), token);
      setProtocol('WebRTC');
      setStatus('connecting');

      // Two-stage fallback (see constants): a stuck negotiation (no track ever
      // attaches) falls back fast; a connected-but-slow first frame is given
      // the longer frame deadline, since a connected stream's frames are
      // imminent. Heavy 4K streams under cold-start/concurrent load decode
      // their first frame past a single short deadline but well before this.
      frameTimer = setTimeout(() => {
        log.api('v3 WebRTC track never attached; falling back to HLS', LogLevel.INFO, { monitorId });
        void startHlsFallback();
      }, V3_WEBRTC_CONNECT_TIMEOUT_S * 1000);

      // 'loadeddata' is unreliable for live MediaStreams, and a paused <video>
      // won't decode the inbound track - so when the track attaches we kick off
      // playback and poll for an actually-decoded, advancing frame.
      webrtc = connectV3WebRTC(wsUrl, video, {
        onTrack: () => {
          video.play().catch(() => { /* muted autoplay should succeed; ignore */ });
          // Track is up: extend to the longer frame deadline for the decode.
          if (frameTimer) clearTimeout(frameTimer);
          frameTimer = setTimeout(() => {
            log.api('v3 WebRTC connected but no frames in time; falling back to HLS', LogLevel.INFO, { monitorId });
            void startHlsFallback();
          }, V3_WEBRTC_FRAME_TIMEOUT_S * 1000);

          if (framePoll) clearInterval(framePoll);
          framePoll = setInterval(() => {
            if (cancelled) return;
            if (video.videoWidth > 0 && video.readyState >= 2 && !video.paused) {
              clearFrameTimer();
              setStatus('webrtc');
            } else if (video.paused) {
              // Retry play in case the first attempt was rejected before data.
              video.play().catch(() => { /* ignore */ });
            }
          }, V3_WEBRTC_FRAME_POLL_MS);
        },
        onReady: () => log.api('v3 WebRTC ready', LogLevel.DEBUG, { monitorId }),
        onError: () => { void startHlsFallback(); },
      });
    };

    (async () => {
      setStatus('connecting');
      setError(null);
      try {
        const session = await acquireLiveSession(getSession(profileId).client, profileId, monitorId);
        sessionStarted = true;
        if (cancelled) return;
        const token = await useAuthStore.getState().getFreshAccessToken(profileId);
        if (cancelled) return;
        if (session.webrtc_signaling) {
          tryWebRTC(session.webrtc_signaling, token);
        } else {
          await startHlsFallback();
        }
      } catch (e) {
        if (cancelled) return;
        log.api('Failed to start v3 live session', LogLevel.ERROR, { monitorId, error: e });
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Failed to start live stream');
      }
    })();

    return () => {
      cancelled = true;
      clearFrameTimer();
      webrtc?.close();
      if (hls) { hls.destroy(); hls = null; }
      if (video) { try { video.removeAttribute('src'); video.srcObject = null; } catch { /* ignore */ } }
      if (sessionStarted) releaseLiveSession(profileId, monitorId);
    };
  }, [enabled, profileId, monitorId, baseUrl, videoRef]);

  return { status, protocol, error };
}
