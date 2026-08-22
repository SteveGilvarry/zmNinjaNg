/**
 * URL builders for zm-api (v3) media + streaming endpoints.
 *
 * v3 media (snapshots, HLS playlists/segments) authenticate with either an
 * Authorization: Bearer header or a `?token=` query param. Browser <img>/<video>
 * tags and native HLS can't set headers, so those use the query-param form; the
 * WebRTC WS upgrade needs no token (auth happens at POST /live/.../start).
 */

function joinBase(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

/** Append `token` (and optional extra params) to a URL. */
export function withToken(
  url: string,
  token?: string | null,
  extra?: Record<string, string | number>,
): string {
  const u = new URL(url);
  if (token) u.searchParams.set('token', token);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

/** Absolute URL for a v3 path against the profile's base (apiUrl) URL. */
export function v3Url(baseUrl: string, path: string): string {
  return joinBase(baseUrl, path);
}

/** Convert an http(s) base + path into a ws(s) URL for the WebRTC/MSE sockets. */
export function v3WebSocketUrl(baseUrl: string, signalingPath: string): string {
  const httpUrl = signalingPath.startsWith('http')
    ? signalingPath
    : joinBase(baseUrl, signalingPath);
  return httpUrl.replace(/^http(s?):\/\//, (_m, s) => `ws${s}://`);
}

/** Current-frame JPEG snapshot URL for a monitor (token in query, cache-busted). */
export function v3SnapshotUrl(
  baseUrl: string,
  monitorId: string | number,
  token?: string | null,
  cacheBuster?: number,
): string {
  const url = joinBase(baseUrl, `/api/v3/monitors/${monitorId}/snapshot`);
  return withToken(url, token, cacheBuster ? { timestamp: cacheBuster } : undefined);
}

/** HLS manifest URL. For native HLS the token must ride in the query string. */
export function v3HlsManifestUrl(
  baseUrl: string,
  hlsPath: string,
  token?: string | null,
): string {
  const url = hlsPath.startsWith('http') ? hlsPath : joinBase(baseUrl, hlsPath);
  return withToken(url, token);
}

/** Event thumbnail URL (token in query). */
export function v3EventThumbnailUrl(
  baseUrl: string,
  eventId: string | number,
  token?: string | null,
): string {
  const url = joinBase(baseUrl, `/api/v3/events/${eventId}/thumbnail`);
  return withToken(url, token);
}

/** Event HLS playback playlist URL (token in query). */
export function v3EventPlaylistUrl(
  baseUrl: string,
  eventId: string | number,
  token?: string | null,
): string {
  const url = joinBase(baseUrl, `/api/v3/events/${eventId}/stream/playlist.m3u8`);
  return withToken(url, token);
}

/** Event progressive MP4 URL (range-capable; token in query). */
export function v3EventVideoUrl(
  baseUrl: string,
  eventId: string | number,
  token?: string | null,
): string {
  const url = joinBase(baseUrl, `/api/v3/events/${eventId}/video`);
  return withToken(url, token);
}
