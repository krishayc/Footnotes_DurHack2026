/**
 * The laptop's side of the phone-to-laptop link.
 *
 *  - Runs clock sync: a quick burst of pings when the phone joins (5 a second for 3 s, to get
 *    a good estimate fast), then one every 2 s to follow the clocks as they drift.
 *  - Receives steps and sensor batches. Everything is stored in PHONE time and converted to
 *    laptop time with the latest clock estimate whenever it is used, so later, better
 *    estimates also improve old data.
 *  - Publishes a small snapshot of stats ~4 times a second for the HUD.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ClockSync, median, type ClockEstimate, type StatusMsg } from '@footnotes/shared';
import { RoomConnection, type LinkSnapshot } from '../shared/connection';
import { SampleBuffer } from '../shared/SampleBuffer';

export interface RemoteStep {
  /** Phone-clock time of the step (ms). */
  phoneT: number;
  n: number;
  inferred: boolean;
  confidence: number;
  /** Laptop time when the message arrived. */
  receivedAt: number;
}

export interface StudioLinkSnapshot extends LinkSnapshot {
  clock: ClockEstimate | null;
  lastRtt: number | null;
  stepCount: number;
  cadenceSpm: number | null;
  /** How long after the foot actually landed the laptop knew about it (ms). */
  stepLatencyMs: number | null;
  phone: Omit<StatusMsg, 'type'> | null;
  lastStepAt: number | null;
  /** How long since ANY message from the phone (ms), null if none yet. */
  phoneSilentMs: number | null;
}

const PING_BURST_MS = 3000;
const PING_BURST_EVERY = 200;
const PING_EVERY = 2000;

export class StudioLink {
  readonly conn: RoomConnection;
  readonly clock = new ClockSync();
  /** Raw accelerometer from the phone, in PHONE time. */
  readonly accel = new SampleBuffer(16384); // ~4 min at 60 Hz, for "save the last minute"
  readonly steps: RemoteStep[] = [];
  private phone: StudioLinkSnapshot['phone'] = null;
  private lastPhoneMsgAt: number | null = null;
  private pingId = 0;
  private lastPingAt = 0;
  private burstUntil = 0;
  private listeners = new Set<() => void>();
  private stepListeners = new Set<(s: RemoteStep) => void>();
  private snapshot: StudioLinkSnapshot;
  private timers: number[] = [];
  private unsub: (() => void)[] = [];

  constructor(room: string) {
    this.conn = new RoomConnection(room, 'studio');
    this.snapshot = this.makeSnapshot();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  onStep(fn: (s: RemoteStep) => void) {
    this.stepListeners.add(fn);
    return () => this.stepListeners.delete(fn);
  }

  /** Tell the phone how to count bumps: one step each, or two (only one leg felt). */
  setPhoneLegMode(legMode: 'both' | 'one') {
    this.conn.send({ type: 'setLegMode', legMode });
  }

  /** Phone time -> laptop time, or null before the first clock estimate. */
  toLocal(phoneT: number): number | null {
    return this.clock.toLocal(phoneT);
  }

  start() {
    this.conn.start();
    this.unsub.push(
      this.conn.onMessage((msg, receivedAt) => {
        if (msg.type !== 'hello' && msg.type !== 'peer' && msg.type !== 'error') {
          this.lastPhoneMsgAt = receivedAt;
        }
        switch (msg.type) {
          case 'hello':
          case 'peer':
            if (
              (msg.type === 'hello' && msg.peerConnected) ||
              (msg.type === 'peer' && msg.connected)
            ) {
              this.burstUntil = performance.now() + PING_BURST_MS;
            }
            break;
          case 'pong':
            this.clock.add(msg.t0, msg.t1, receivedAt);
            break;
          case 'step': {
            const step: RemoteStep = {
              phoneT: msg.t,
              n: msg.n,
              inferred: !!msg.inferred,
              confidence: msg.confidence ?? 0,
              receivedAt,
            };
            this.steps.push(step);
            if (this.steps.length > 256) this.steps.shift();
            for (const fn of this.stepListeners) fn(step);
            break;
          }
          case 'accelBatch':
            for (const [t, x, y, z] of msg.samples) this.accel.push(t, x, y, z);
            break;
          case 'status':
            this.phone = {
              motion: msg.motion,
              wakeLock: msg.wakeLock,
              rateHz: msg.rateHz,
              oneLeg: msg.oneLeg,
              legMode: msg.legMode,
              cadenceSpm: msg.cadenceSpm,
            };
            break;
        }
      }),
      this.conn.subscribe(() => this.publish()),
    );

    this.timers.push(
      window.setInterval(() => this.maybePing(), PING_BURST_EVERY),
      window.setInterval(() => this.publish(), 250),
    );
  }

  stop() {
    for (const t of this.timers) window.clearInterval(t);
    for (const u of this.unsub) u();
    this.timers = [];
    this.unsub = [];
    this.conn.stop();
  }

  private maybePing() {
    if (!this.conn.open || !this.conn.getSnapshot().peerConnected) return;
    const now = performance.now();
    const interval = now < this.burstUntil ? PING_BURST_EVERY : PING_EVERY;
    if (now - this.lastPingAt < interval - 5) return;
    this.lastPingAt = now;
    this.conn.send({ type: 'ping', id: ++this.pingId, t0: now });
  }

  private makeSnapshot(): StudioLinkSnapshot {
    const steps = this.steps;
    const last = steps[steps.length - 1];
    // Pace: median gap between the last ~10 steps (inferred ones included: they fill the
    // missing leg so gaps stay step-sized).
    const gaps: number[] = [];
    for (let i = Math.max(1, steps.length - 10); i < steps.length; i++) {
      const g = steps[i].phoneT - steps[i - 1].phoneT;
      if (g > 0 && g < 2500) gaps.push(g);
    }
    const lastReal = [...steps].reverse().find((s) => !s.inferred);
    const lastRealLocal = lastReal ? this.toLocal(lastReal.phoneT) : null;
    return {
      ...this.conn.getSnapshot(),
      clock: this.clock.current,
      lastRtt: this.clock.lastRtt,
      stepCount: last?.n ?? 0,
      cadenceSpm: gaps.length >= 3 ? 60000 / median(gaps) : null,
      stepLatencyMs:
        lastReal && lastRealLocal !== null ? lastReal.receivedAt - lastRealLocal : null,
      phone: this.phone,
      lastStepAt: last ? last.receivedAt : null,
      phoneSilentMs: this.lastPhoneMsgAt === null ? null : performance.now() - this.lastPhoneMsgAt,
    };
  }

  private publish() {
    this.snapshot = this.makeSnapshot();
    for (const fn of this.listeners) fn();
  }
}

/** Create the Studio's link for a room and keep it running while the Studio is open. */
export function useStudioLink(room: string): { link: StudioLink; snap: StudioLinkSnapshot } {
  const link = useMemo(() => new StudioLink(room), [room]);
  useEffect(() => {
    link.start();
    // Dev only: reach the link from the browser console as window.__studio for debugging.
    if (import.meta.env.DEV) (window as unknown as { __studio: StudioLink }).__studio = link;
    return () => link.stop();
  }, [link]);
  const snap = useSyncExternalStore(link.subscribe, link.getSnapshot);
  return { link, snap };
}
