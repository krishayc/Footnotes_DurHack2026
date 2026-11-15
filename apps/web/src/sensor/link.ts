/**
 * The phone's side of the phone-to-laptop link.
 *
 *  - Answers the laptop's clock-sync pings straight away with its own clock reading.
 *  - Sends every detected step (with its phone-clock time).
 *  - Batches raw accelerometer samples every 150 ms (for the Studio's signal view and,
 *    in Stage 8, the freeze index) instead of flooding the socket with 60+ messages a second.
 *  - Sends a status message every 2 s (motion permission, wake lock, sample rate).
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { AccelSample } from '@footnotes/shared';
import { RoomConnection, type LinkSnapshot } from '../shared/connection';
import { motion } from './motion';
import { steps } from './steps';
import { wakeLock } from './wakeLock';
import { Store } from '../shared/store';
import type { WalkCommandMsg, WalkStateMsg } from '@footnotes/shared';

/** The latest walk state from the laptop (null until the Studio has sent one). */
export const walk = new Store<{ state: Omit<WalkStateMsg, 'type'> | null; receivedAt: number }>({
  state: null,
  receivedAt: 0,
});

let activeLink: SensorLink | null = null;

/** Ask the laptop to do something (find my pace, start the beat...). False if not linked. */
export function sendWalkCommand(action: WalkCommandMsg['action'], value?: number): boolean {
  return activeLink?.conn.send({ type: 'walkCommand', action, value }) ?? false;
}

const BATCH_MS = 150;
const STATUS_MS = 2000;

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

class SensorLink {
  readonly conn: RoomConnection;
  private pending: AccelSample[] = [];
  private cleanups: (() => void)[] = [];

  constructor(room: string) {
    this.conn = new RoomConnection(room, 'sensor');
  }

  start() {
    // The one live link, so screens can send walk commands without passing it around.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    activeLink = this;
    this.conn.start();

    this.cleanups.push(
      this.conn.onMessage((msg) => {
        if (msg.type === 'ping') {
          this.conn.send({ type: 'pong', id: msg.id, t0: msg.t0, t1: performance.now() });
        } else if (msg.type === 'peer' && msg.connected) {
          this.sendStatus();
        } else if (msg.type === 'walkState') {
          const { type: _t, ...state } = msg;
          void _t;
          walk.set({ state, receivedAt: performance.now() });
        } else if (msg.type === 'setLegMode') {
          steps.updateSettings({ legMode: msg.legMode });
          steps.resetCount();
          this.sendStatus();
        }
      }),
      steps.onStep((s) => {
        this.conn.send({
          type: 'step',
          t: round(s.t, 1),
          n: s.n,
          confidence: round(s.confidence, 2),
          inferred: s.inferred || undefined,
        });
      }),
      motion.onSample((t, x, y, z) => {
        this.pending.push([round(t, 1), round(x, 2), round(y, 2), round(z, 2)]);
        if (this.pending.length > 200) this.pending.shift(); // offline: keep only recent
      }),
    );

    const batch = window.setInterval(() => {
      if (!this.pending.length || !this.conn.open) return;
      this.conn.send({
        type: 'accelBatch',
        samples: this.pending,
        rateHz: round(motion.getSnapshot().rateHz, 1),
      });
      this.pending = [];
    }, BATCH_MS);
    const status = window.setInterval(() => this.sendStatus(), STATUS_MS);
    this.cleanups.push(
      () => window.clearInterval(batch),
      () => window.clearInterval(status),
    );
  }

  stop() {
    if (activeLink === this) activeLink = null;
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
    this.conn.stop();
  }

  private sendStatus() {
    const m = motion.getSnapshot();
    const motionState =
      m.state === 'running'
        ? 'granted'
        : m.state === 'denied'
          ? 'denied'
          : m.state === 'unsupported' || m.state === 'insecure'
            ? 'unsupported'
            : 'unknown';
    this.conn.send({
      type: 'status',
      motion: motionState,
      wakeLock: wakeLock.getSnapshot() === 'on',
      rateHz: round(m.rateHz, 1),
      oneLeg: steps.getSnapshot().oneLeg,
      legMode: steps.getSnapshot().settings.legMode,
      cadenceSpm: steps.getSnapshot().cadenceSpm,
    });
  }
}

const noSubscribe = () => () => {};
const noSnapshot = () => null;

/** Connect this phone to the room while the component using it is on screen. */
export function useSensorLink(room: string | null): LinkSnapshot | null {
  // Creating the object has no side effects; connecting happens in the effect below.
  const link = useMemo(() => (room ? new SensorLink(room) : null), [room]);
  useEffect(() => {
    if (!link) return;
    link.start();
    return () => link.stop();
  }, [link]);
  return useSyncExternalStore(
    link ? link.conn.subscribe : noSubscribe,
    link ? link.conn.getSnapshot : noSnapshot,
  );
}
