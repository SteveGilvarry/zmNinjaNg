import { describe, it, expect } from 'vitest';
import {
  withToken,
  v3Url,
  v3WebSocketUrl,
  v3SnapshotUrl,
  v3HlsManifestUrl,
  v3EventPlaylistUrl,
} from '../v3-url-builder';

const BASE = 'http://192.168.0.45:8080';

describe('v3-url-builder', () => {
  it('joins base + path without double slashes', () => {
    expect(v3Url(BASE + '/', '/api/v3/monitors')).toBe('http://192.168.0.45:8080/api/v3/monitors');
    expect(v3Url(BASE, 'api/v3/monitors')).toBe('http://192.168.0.45:8080/api/v3/monitors');
  });

  it('appends a token query param', () => {
    expect(withToken('http://h/x', 'abc')).toBe('http://h/x?token=abc');
    expect(withToken('http://h/x', null)).toBe('http://h/x');
  });

  it('converts http/https base to ws/wss for sockets', () => {
    expect(v3WebSocketUrl(BASE, '/api/v3/live/1/webrtc/ws')).toBe(
      'ws://192.168.0.45:8080/api/v3/live/1/webrtc/ws',
    );
    expect(v3WebSocketUrl('https://zm.example.com', '/api/v3/live/2/webrtc/ws')).toBe(
      'wss://zm.example.com/api/v3/live/2/webrtc/ws',
    );
  });

  it('accepts an absolute signaling path from the start response', () => {
    expect(v3WebSocketUrl(BASE, 'http://other:9000/ws')).toBe('ws://other:9000/ws');
  });

  it('appends a token to a ws:// URL (the /webrtc/ws upgrade is auth-gated)', () => {
    const ws = withToken(v3WebSocketUrl(BASE, '/api/v3/live/1/webrtc/ws'), 'abc123');
    expect(ws).toBe('ws://192.168.0.45:8080/api/v3/live/1/webrtc/ws?token=abc123');
  });

  it('builds a token-bearing, cache-busted snapshot URL', () => {
    const url = new URL(v3SnapshotUrl(BASE, 7, 'tok', 12345));
    expect(url.pathname).toBe('/api/v3/monitors/7/snapshot');
    expect(url.searchParams.get('token')).toBe('tok');
    expect(url.searchParams.get('timestamp')).toBe('12345');
  });

  it('builds HLS manifest and event playlist URLs with token', () => {
    expect(v3HlsManifestUrl(BASE, '/api/v3/live/1/hls/live.m3u8', 'tok')).toBe(
      'http://192.168.0.45:8080/api/v3/live/1/hls/live.m3u8?token=tok',
    );
    expect(v3EventPlaylistUrl(BASE, 99, 'tok')).toContain('/api/v3/events/99/stream/playlist.m3u8?token=tok');
  });
});
