import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Minimal controllable mocks for WebSocket + RTCPeerConnection so we can drive
// the server->client signaling sequence and assert ICE candidate handling.

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];
  readyState = 1;
  url: string;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(url: string) { this.url = url; MockWebSocket.instances.push(this); }
  send(data: string) { this.sent.push(data); }
  close() { /* noop */ }
  emit(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}

class MockPeerConnection {
  static last: MockPeerConnection;
  addIceCandidate = vi.fn(async () => {});
  setRemoteDescription = vi.fn(async () => {});
  setLocalDescription = vi.fn(async () => {});
  createAnswer = vi.fn(async () => ({ type: 'answer', sdp: 'ANSWER_SDP' }));
  addTransceiver = vi.fn();
  getReceivers = vi.fn(() => []);
  close = vi.fn();
  onicecandidate: ((e: { candidate: unknown }) => void) | null = null;
  ontrack: ((e: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState = 'new';
  constructor() { MockPeerConnection.last = this; }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('connectV3WebRTC inbound ICE candidates', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal('RTCPeerConnection', MockPeerConnection as unknown as typeof RTCPeerConnection);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('buffers candidates that arrive before the offer, then applies them after setRemoteDescription', async () => {
    const { connectV3WebRTC } = await import('../v3-webrtc');
    const video = {} as HTMLVideoElement;
    connectV3WebRTC('ws://h/api/v3/live/2/webrtc/ws?token=t', video, {});
    const ws = MockWebSocket.instances[0];
    const pc = MockPeerConnection.last;

    // Candidate before offer -> must be buffered, not applied yet.
    ws.emit({ type: 'icecandidate', candidate: 'cand-early', sdpMid: '0', sdpMLineIndex: 0 });
    await flush();
    expect(pc.addIceCandidate).not.toHaveBeenCalled();

    // Offer -> sets remote description, then flushes the buffered candidate.
    ws.emit({ type: 'offer', session_id: 's1', sdp: 'OFFER_SDP' });
    await flush();
    expect(pc.setRemoteDescription).toHaveBeenCalledOnce();
    expect(pc.addIceCandidate).toHaveBeenCalledOnce();
    expect(pc.addIceCandidate).toHaveBeenCalledWith({ candidate: 'cand-early', sdpMid: '0', sdpMLineIndex: 0 });
    // And we answered.
    expect(ws.sent.some((m) => JSON.parse(m).type === 'answer')).toBe(true);
  });

  it('applies candidates immediately once the remote description is set', async () => {
    const { connectV3WebRTC } = await import('../v3-webrtc');
    const video = {} as HTMLVideoElement;
    connectV3WebRTC('ws://h/api/v3/live/2/webrtc/ws?token=t', video, {});
    const ws = MockWebSocket.instances[0];
    const pc = MockPeerConnection.last;

    ws.emit({ type: 'offer', session_id: 's1', sdp: 'OFFER_SDP' });
    await flush();
    ws.emit({ type: 'icecandidate', candidate: 'cand-late', sdpMid: '0', sdpMLineIndex: 0 });
    await flush();
    expect(pc.addIceCandidate).toHaveBeenCalledWith({ candidate: 'cand-late', sdpMid: '0', sdpMLineIndex: 0 });
  });

  it('ignores an empty candidate', async () => {
    const { connectV3WebRTC } = await import('../v3-webrtc');
    connectV3WebRTC('ws://h/api/v3/live/2/webrtc/ws?token=t', {} as HTMLVideoElement, {});
    const ws = MockWebSocket.instances[0];
    const pc = MockPeerConnection.last;
    ws.emit({ type: 'offer', session_id: 's1', sdp: 'OFFER_SDP' });
    await flush();
    ws.emit({ type: 'icecandidate', candidate: '' });
    await flush();
    expect(pc.addIceCandidate).not.toHaveBeenCalled();
  });
});
