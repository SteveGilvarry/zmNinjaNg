# zm-api (ZoneMinder API v3) streaming wire protocols

Reference for the v3 live-streaming client (`hooks/useV3LiveStream.ts`,
`lib/v3-webrtc.ts`).

**Source of truth = the deployed API's OpenAPI spec**, which exposes only
**WebRTC + HLS** under `/api/v3/live/...`. The Rust working copy still carries
lingering MSE routes/files, but MSE has been removed from the deployed API, so
this client uses WebRTC + HLS only. Wire-level WebRTC/HLS details below were
cross-checked against the Rust handlers (`src/handlers/live.rs`,
`src/streaming/**`). No audio is wired server-side yet.

## Session lifecycle

1. `POST /api/v3/live/{monitor_id}/start` (JWT **header** auth) with
   `{ "enable_webrtc": true, "enable_hls": true }`.
   → `200 { monitor_id, status:"started", hls_playlist, webrtc_signaling }`
   Unselected transports come back `null`. An already-running session is a
   **`CONFLICT_ERROR` returned as HTTP 500** on the deployed server (the spec
   says 409) — detect by `body.kind === "CONFLICT_ERROR"`, not the status code,
   and reuse the conventional URLs. `404` = FIFO unavailable, `503` = coordinator
   not configured. `hls_playlist` is the **media** playlist
   (`/api/v3/live/{id}/hls/live.m3u8`).
2. Open WebRTC WS and/or load HLS using the returned paths.
3. `DELETE /api/v3/live/{monitor_id}/stop` → `204` (idempotent) on teardown.

## WebRTC signaling — `GET /api/v3/live/{monitor_id}/webrtc/ws`

WebSocket, JSON text frames. **The server is the offerer; the browser answers.**
**The upgrade is auth-gated and requires `?token=<jwt>`** (verified against the
deployed server — without it the socket closes 1006). A browser WebSocket can't
set headers, so the JWT must ride in the query string.

Messages are a serde tagged union: lowercase `type` discriminator.

- **Server → client** `offer`: `{ type:"offer", session_id, sdp }` — full SDP with
  all ICE candidates already embedded (server does not trickle).
- **Client → server** `answer`: `{ type:"answer", session_id, sdp }`.
- **Client → server** `icecandidate` (optional trickle):
  `{ type:"icecandidate", session_id, candidate, sdpMid, sdpMLineIndex }`
  (camelCase ICE fields).
- **Server → client** `ready`: `{ type:"ready", session_id, monitor_id }` after DTLS.
- Either direction `ping`/`pong` keepalive; `error`: `{ type:"error", message }`.

Client role: create `RTCPeerConnection`, add a `recvonly` video transceiver,
`setRemoteDescription(offer)`, `createAnswer()`, `setLocalDescription`, send the
answer (thread `session_id`). Attach `pc.ontrack` → `video.srcObject = stream`.
Forward `pc.onicecandidate` as `icecandidate` messages. Codecs: H.264
(profile-level-id `42e01f`/`640c1f`) and H.265. Server enforces a 30s post-answer
DTLS timeout; a cached keyframe is injected on connect for fast start.

## HLS — `GET /api/v3/live/{monitor_id}/hls/{master.m3u8,live.m3u8,init.mp4,segment_NNNNN.m4s}`

fMP4 segments (not MPEG-TS), `avc1.<profile_level_id>` / `hevc`. LL-HLS is enabled
by default (`_HLS_msn`/`_HLS_part`/`_HLS_skip`). **Auth is required** (verified:
no token → 401): accepts `Authorization: Bearer <jwt>` header OR `?token=<jwt>`.
The media playlist references segments (`init.mp4`, `segment_NNNNN.m4s`) by
relative path, so hls.js's header-based `xhrSetup` covers playlist + segments.
→ Use hls.js with an `xhrSetup` that adds the bearer header (covers playlist +
segments). For native HLS (`<video src>` on Safari/iOS) headers aren't possible,
so append `?token=` to the manifest (segment-level token is a known limitation).

## Snapshot — `GET /api/v3/monitors/{monitor_id}/snapshot`

`image/jpeg`, media auth (header or `?token=`), 2s server cache (bust with
`?timestamp=`). 404 if no keyframe within 5s.
