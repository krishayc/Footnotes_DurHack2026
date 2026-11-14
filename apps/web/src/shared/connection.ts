/**
 * A WebSocket link to the relay server that looks after itself.
 *
 * - Joins the room as 'sensor' or 'studio' as soon as it connects.
 * - If the connection drops (WiFi blip, phone locked, server restarted) it reconnects on its
 *   own, waiting a little longer after each failed try (0.5 s, 1 s, 2 s ... up to 5 s), and
 *   immediately when the page becomes visible again.
 * - Exposes a simple status for kind on-screen messages.
 */
import {
  PROTOCOL_VERSION,
  WS_PATH,
  parseMessage,
  type AnyMsg,
  type RelayedMsg,
  type Role,
} from '@footnotes/shared';

export type LinkStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface LinkSnapshot {
  status: LinkStatus;
  /** Is the other device (phone or laptop) in the room right now? */
  peerConnected: boolean;
  /** Last problem reported by the server, in plain words. */
  error: string | null;
}

const MAX_BACKOFF_MS = 5000;

export class RoomConnection {
  private ws: WebSocket | null = null;
  private backoff = 500;
  private retryTimer: number | undefined;
  private closedByUs = false;
  private snapshot: LinkSnapshot = { status: 'connecting', peerConnected: false, error: null };
  private listeners = new Set<() => void>();
  private messageListeners = new Set<(msg: AnyMsg, receivedAt: number) => void>();

  constructor(
    readonly room: string,
    readonly role: Role,
  ) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  onMessage(fn: (msg: AnyMsg, receivedAt: number) => void) {
    this.messageListeners.add(fn);
    return () => this.messageListeners.delete(fn);
  }

  start() {
    this.closedByUs = false;
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('online', this.onVisible);
    this.connect();
  }

  stop() {
    this.closedByUs = true;
    window.clearTimeout(this.retryTimer);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('online', this.onVisible);
    this.ws?.close();
    this.ws = null;
  }

  /** Send a message to the other device. Returns false if not connected (message dropped). */
  send(msg: RelayedMsg): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  get open() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private connect() {
    window.clearTimeout(this.retryTimer);
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}${WS_PATH}`);
    this.ws = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'join',
          room: this.room,
          role: this.role,
          protocol: PROTOCOL_VERSION,
        }),
      );
    };

    ws.onmessage = (ev) => {
      const receivedAt = performance.now(); // stamp first, before any parsing work
      const msg = parseMessage(ev.data);
      if (!msg) return;
      if (msg.type === 'hello') {
        this.backoff = 500;
        this.set({ status: 'connected', peerConnected: msg.peerConnected, error: null });
      } else if (msg.type === 'peer') {
        this.set({ peerConnected: msg.connected });
      } else if (msg.type === 'error') {
        this.set({ status: 'error', error: msg.message });
      }
      for (const fn of this.messageListeners) fn(msg, receivedAt);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return; // an old socket we already replaced
      this.ws = null;
      if (this.closedByUs) return;
      if (this.snapshot.status !== 'error')
        this.set({ status: 'reconnecting', peerConnected: false });
      this.retryTimer = window.setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff * 2);
    };
  }

  /** Coming back to the page (or back online): reconnect straight away if we need to. */
  private onVisible = () => {
    if (document.visibilityState !== 'visible' || this.closedByUs) return;
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.backoff = 500;
      this.connect();
    }
  };

  private set(patch: Partial<LinkSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const fn of this.listeners) fn();
  }
}
