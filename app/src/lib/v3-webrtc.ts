/**
 * WebRTC client for zm-api (v3) live streaming.
 *
 * Protocol (see api/v3/STREAMING.md): the SERVER is the offerer. The browser
 * connects the signaling WebSocket, receives a (candidate-less) `offer`, replies
 * with an `answer`, and trickles ICE candidates both ways - sending its own and
 * applying the server's `icecandidate` messages - then attaches the inbound
 * video track to the <video> element. The token rides on the WS upgrade query;
 * the session was created by POST /live/.../start.
 */

import { log, LogLevel } from './logger';

interface SignalOffer {
  type: 'offer';
  session_id: string;
  sdp: string;
}
interface SignalReady {
  type: 'ready';
  session_id: string;
  monitor_id: number;
}
interface SignalIceCandidate {
  type: 'icecandidate';
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}
interface SignalError {
  type: 'error';
  message: string;
}
interface SignalPing {
  type: 'ping';
}
type ServerMessage =
  | SignalOffer
  | SignalReady
  | SignalIceCandidate
  | SignalError
  | SignalPing
  | { type: string };

export interface V3WebRTCCallbacks {
  /** Inbound track attached to the video element. */
  onTrack?: (stream: MediaStream) => void;
  /** Server signalled DTLS-ready. */
  onReady?: () => void;
  /** Terminal failure (socket error, ICE failure, server error). */
  onError?: (error: Error) => void;
}

export interface V3WebRTCHandle {
  close: () => void;
}

/**
 * Open a v3 WebRTC session over the signaling WebSocket and render it into
 * `video`. Returns a handle whose close() tears down the peer connection,
 * socket, and media tracks. The caller owns timeout/fallback policy.
 */
export function connectV3WebRTC(
  wsUrl: string,
  video: HTMLVideoElement,
  callbacks: V3WebRTCCallbacks = {},
): V3WebRTCHandle {
  let closed = false;
  let sessionId: string | null = null;
  // The server now sends a candidate-less offer and trickles its ICE candidates
  // over the socket (a=ice-options:trickle). Candidates that arrive before the
  // remote description is applied are buffered and flushed once it is set.
  let remoteDescriptionSet = false;
  const pendingCandidates: RTCIceCandidateInit[] = [];
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });
  const ws = new WebSocket(wsUrl);

  const fail = (error: Error) => {
    if (closed) return;
    log.api('v3 WebRTC error', LogLevel.DEBUG, { error: error.message });
    callbacks.onError?.(error);
  };

  const send = (msg: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  // Receive-only video; the server pushes the camera track to us.
  try {
    pc.addTransceiver('video', { direction: 'recvonly' });
  } catch {
    // Some engines infer the recvonly track from the offer; non-fatal.
  }

  pc.ontrack = (event) => {
    const stream = event.streams[0] ?? new MediaStream([event.track]);
    video.srcObject = stream;
    callbacks.onTrack?.(stream);
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate || !sessionId) return;
    send({
      type: 'icecandidate',
      session_id: sessionId,
      candidate: event.candidate.candidate,
      sdpMid: event.candidate.sdpMid,
      sdpMLineIndex: event.candidate.sdpMLineIndex,
    });
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') fail(new Error('WebRTC connection failed'));
  };

  ws.onmessage = async (event) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
    } catch {
      return;
    }
    switch (msg.type) {
      case 'offer': {
        const offer = msg as SignalOffer;
        sessionId = offer.session_id;
        try {
          await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
          remoteDescriptionSet = true;
          // Flush any candidates that arrived before the offer.
          for (const c of pendingCandidates) {
            try { await pc.addIceCandidate(c); } catch { /* stale/invalid candidate */ }
          }
          pendingCandidates.length = 0;
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ type: 'answer', session_id: sessionId, sdp: answer.sdp });
        } catch (e) {
          fail(e instanceof Error ? e : new Error('Failed to answer offer'));
        }
        break;
      }
      case 'icecandidate': {
        const c = msg as SignalIceCandidate;
        if (!c.candidate) break;
        const init: RTCIceCandidateInit = {
          candidate: c.candidate,
          sdpMid: c.sdpMid ?? undefined,
          sdpMLineIndex: c.sdpMLineIndex ?? undefined,
        };
        if (remoteDescriptionSet) {
          try { await pc.addIceCandidate(init); } catch { /* stale/invalid candidate */ }
        } else {
          pendingCandidates.push(init);
        }
        break;
      }
      case 'ready':
        callbacks.onReady?.();
        break;
      case 'ping':
        send({ type: 'pong' });
        break;
      case 'error':
        fail(new Error((msg as SignalError).message || 'Server signalling error'));
        break;
      default:
        break;
    }
  };

  ws.onerror = () => fail(new Error('Signaling socket error'));
  ws.onclose = () => {
    if (!closed) fail(new Error('Signaling socket closed'));
  };

  const close = () => {
    if (closed) return;
    closed = true;
    try {
      pc.getReceivers().forEach((r) => r.track?.stop());
    } catch { /* ignore */ }
    try { pc.close(); } catch { /* ignore */ }
    try { ws.close(); } catch { /* ignore */ }
    if (video.srcObject) video.srcObject = null;
  };

  return { close };
}
