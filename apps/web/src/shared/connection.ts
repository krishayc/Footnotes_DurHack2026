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
  /** How many times we have tried to connect (for diagnosing a stuck link). */
  attempts: number;
  /** The WebSocket address we are using. */
  url: string;
}

const MAX_BACKOFF_MS = 5000;
const CONNECT_TIMEOUT_MS = 6000;
const KEEPALIVE_MS = 3000;
/** Heard nothing for this long = the connection is dead. */
const SILENT_LIMIT_MS = 8000;
/** Coming back to the page after this long without news: reconnect at once. */
const STALE_ON_RETURN_MS = 4000;

export class RoomConnection {
  private ws: WebSocket | null = null;
  private backoff = 500;
  private retryTimer: number | undefined;
  private closedByUs = false;
  private watchdog: number | undefined;
  private liveness: number | undefined;
  /** When we last heard ANYTHING from the server (performance.now()). */
  private lastHeardAt = 0;
  /** Times we took the room back after another page took our place (recent only). */
  private takeovers: number[] = [];
  /** A phone page that was hidden when it lost the room: rejoin when it's on screen again. */
  private waitingForVisible = false;
  /** Recent connection events, for diagnosing drops (sent to the server's connection log). */
  private events: string[] = [];
  private dropsSinceReport = 0;
  private snapshot: LinkSnapshot = {
    status: 'connecting',
    peerConnected: false,
    error: null,
    attempts: 0,
    url: '',
  };
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

  /** Note an event for the connection log. */
  private note(text: string) {
    const t = (performance.now() / 1000).toFixed(1);
    this.events.push(`${t}s ${text}${document.visibilityState === 'hidden' ? ' [hidden]' : ''}`);
    if (this.events.length > 60) this.events.shift();
  }

  /** Send our side of the story to the server log (plain HTTP, works even if sockets don't). */
  private report() {
    try {
      void fetch('/api/clientlog', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: this.role, room: this.room, events: this.events }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* never let logging break the app */
    }
  }

  start() {
    this.closedByUs = false;
    document.addEventListener('visibilitychange', this.noteVisibility);
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('online', this.onVisible);
    this.connect();
    // Every 3 s: say "still here?" and check we've heard something recently.
    window.clearInterval(this.liveness);
    this.liveness = window.setInterval(() => this.checkAlive(), KEEPALIVE_MS);
  }

  stop() {
    this.closedByUs = true;
    window.clearTimeout(this.retryTimer);
    window.clearTimeout(this.watchdog);
    window.clearInterval(this.liveness);
    document.removeEventListener('visibilitychange', this.onVisible);
    document.removeEventListener('visibilitychange', this.noteVisibility);
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
    window.clearTimeout(this.watchdog);
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}${WS_PATH}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    this.note(`connecting (try ${this.snapshot.attempts + 1})`);
    this.set({ attempts: this.snapshot.attempts + 1, url });

    // Watchdog: if the server hasn't welcomed us within a few seconds, this attempt is stuck
    // (a half-open connection through a proxy or tunnel can sit in "connecting" forever).
    // Give up on it and try again rather than waiting indefinitely.
    let welcomed = false;
    this.watchdog = window.setTimeout(() => {
      if (welcomed || this.ws !== ws) return;
      console.warn(`[footnotes] no welcome from ${url} after ${CONNECT_TIMEOUT_MS} ms, retrying`);
      this.note('no welcome from the server in 6 s: retrying');
      this.handleDrop(ws);
      ws.close();
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      this.lastHeardAt = performance.now();
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
      if (this.ws === ws) this.lastHeardAt = receivedAt;
      const msg = parseMessage(ev.data);
      if (!msg || msg.type === 'keepalive') return;
      if (msg.type === 'hello') {
        welcomed = true;
        this.note(`joined room (laptop ${msg.peerConnected ? 'here' : 'not here'})`);
        if (this.dropsSinceReport > 0) {
          this.dropsSinceReport = 0;
          this.report();
        }
        window.clearTimeout(this.watchdog);
        this.backoff = 500;
        this.set({ status: 'connected', peerConnected: msg.peerConnected, error: null });
      } else if (msg.type === 'peer') {
        this.set({ peerConnected: msg.connected });
      } else if (msg.type === 'error') {
        this.set({ status: 'error', error: msg.message });
      }
      for (const fn of this.messageListeners) fn(msg, receivedAt);
    };

    ws.onclose = (ev) => {
      if (this.ws === ws) {
        this.note(
          `closed: code ${ev.code}${ev.reason ? ` "${ev.reason}"` : ''}${ev.wasClean ? '' : ' (not clean)'}`,
        );
        this.dropsSinceReport++;
      }
      // 4000 = the server gave our place in the room to a newer connection (the same page
      // opened in another tab or on another device).
      if (ev.code === 4000 && this.ws === ws && this.role === 'sensor') {
        this.onReplaced(ws);
        return;
      }
      // The laptop: the newest Studio tab wins; this one stops and says so.
      if (ev.code === 4000 && this.ws === ws) {
        this.ws = null;
        this.closedByUs = true;
        window.clearTimeout(this.watchdog);
        window.clearInterval(this.liveness);
        this.set({
          status: 'error',
          peerConnected: false,
          error:
            this.role === 'studio'
              ? 'The Studio was opened in another tab. Use that one, or reload this one.'
              : 'Another phone joined this room. Reload this page to take over again.',
        });
        return;
      }
      this.handleDrop(ws);
    };
  }

  /**
   * Another phone page took our place in the room. Every QR scan opens a new browser tab, so
   * old Footnotes tabs can wake up in the background and do this. Rule: the page the person
   * is LOOKING AT wins. On screen: take the room back in a second. Hidden: wait until it's on
   * screen again (a hidden page can't count steps anyway). If two pages that are both on
   * screen keep swapping, stop and say so instead of flapping forever.
   */
  private noteVisibility = () => this.note(`page ${document.visibilityState}`);

  private onReplaced(ws: WebSocket) {
    this.ws = null;
    window.clearTimeout(this.watchdog);
    window.clearTimeout(this.retryTimer);
    const now = performance.now();
    this.takeovers = this.takeovers.filter((t) => now - t < 30_000);
    if (this.takeovers.length >= 3) {
      this.closedByUs = true;
      window.clearInterval(this.liveness);
      this.set({
        status: 'error',
        peerConnected: false,
        error:
          'Footnotes is open on another phone or in another tab. Close the others, then reload this page.',
      });
      this.note('gave up: kept being replaced');
      this.report();
      return;
    }
    this.set({ status: 'reconnecting', peerConnected: false });
    if (document.visibilityState !== 'visible') {
      this.waitingForVisible = true;
      return;
    }
    this.takeovers.push(now);
    this.retryTimer = window.setTimeout(() => this.connect(), 1000);
    void ws;
  }

  /** A socket closed or got stuck: schedule a reconnect (once per socket). */
  private handleDrop(ws: WebSocket) {
    if (this.ws !== ws) return; // an old socket we already replaced
    this.ws = null;
    window.clearTimeout(this.watchdog);
    if (this.closedByUs) return;
    if (this.snapshot.status !== 'error')
      this.set({ status: 'reconnecting', peerConnected: false });
    // A hidden phone page can't sense steps: don't reconnect (and risk bumping the page the
    // person is using) until it's on screen again.
    if (this.role === 'sensor' && document.visibilityState !== 'visible') {
      this.waitingForVisible = true;
      return;
    }
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.connect(), this.backoff);
    this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff * 2);
  }

  /**
   * A socket can die without telling us: the phone locks, Safari freezes the page, WiFi
   * changes. It still says "open" but nothing arrives. If we've heard nothing (not even a
   * keepalive reply) for a while, throw it away and reconnect.
   */
  private checkAlive() {
    const ws = this.ws;
    if (this.closedByUs || !ws || ws.readyState !== WebSocket.OPEN) return;
    // Hidden tabs run timers rarely; only judge silence while the page is on screen
    // (coming back on screen is handled by onVisible).
    if (
      document.visibilityState === 'visible' &&
      performance.now() - this.lastHeardAt > SILENT_LIMIT_MS
    ) {
      console.warn('[footnotes] connection went silent, reconnecting');
      this.note('heard nothing for 8 s: reconnecting');
      this.handleDrop(ws);
      ws.close();
      return;
    }
    ws.send(JSON.stringify({ type: 'keepalive' }));
  }

  /** Coming back to the page (or back online): reconnect straight away if we need to. */
  private onVisible = () => {
    if (document.visibilityState !== 'visible' || this.closedByUs) return;
    if (this.waitingForVisible) {
      this.waitingForVisible = false;
      window.clearTimeout(this.retryTimer);
      this.backoff = 500;
      this.connect();
      return;
    }
    const ws = this.ws;
    const stale = performance.now() - this.lastHeardAt > STALE_ON_RETURN_MS;
    if (!ws || ws.readyState === WebSocket.CLOSED || (ws.readyState === WebSocket.OPEN && stale)) {
      // After the phone was locked, an "open" socket is usually dead: start fresh.
      if (ws) {
        this.handleDrop(ws);
        ws.close();
      }
      window.clearTimeout(this.retryTimer);
      this.backoff = 500;
      this.connect();
    }
  };

  private set(patch: Partial<LinkSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const fn of this.listeners) fn();
  }
}
