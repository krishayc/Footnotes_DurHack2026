/**
 * Reading the phone's accelerometer.
 *
 * The browser fires a `devicemotion` event many times a second. Each event carries
 * `accelerationIncludingGravity` (x, y, z in m/s^2): a phone lying still reads about 9.8 on
 * whichever axis points down. We keep gravity in, because for step detection (Stage 2) we use
 * the overall magnitude sqrt(x^2+y^2+z^2), which does not care how the phone sits in the pocket.
 *
 * Permissions:
 *  - Needs a secure page (HTTPS or localhost) on every modern phone.
 *  - iOS Safari additionally needs DeviceMotionEvent.requestPermission(), and that call MUST
 *    happen directly inside a tap handler (no awaits before it), or iOS refuses silently.
 *  - Android Chrome normally just works over HTTPS.
 *
 * This lives outside React as a single shared object, so the graph, the step detector and the
 * network sender can all read the same samples without re-rendering on every event.
 */
import { SampleBuffer } from '../shared/SampleBuffer';

export type MotionState =
  | 'idle' // not started yet
  | 'requesting' // waiting for the iOS permission prompt
  | 'waiting' // listening, no samples yet
  | 'running' // samples arriving
  | 'denied' // the person (or the browser) said no
  | 'unsupported' // this browser has no motion API at all
  | 'insecure' // page opened over http://, sensors blocked
  | 'no-data'; // listening, but nothing arrived (e.g. a laptop, or sensors disabled)

export interface MotionSnapshot {
  state: MotionState;
  /** Measured events per second. */
  rateHz: number;
  /** What the browser claims the interval is, in ms (often differs from reality). */
  reportedIntervalMs: number | null;
  total: number;
  latest: { x: number; y: number; z: number; mag: number } | null;
}

type Listener = () => void;
type SampleListener = (t: number, x: number, y: number, z: number) => void;

const NO_DATA_TIMEOUT_MS = 3000;

interface IOSMotionEvent {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

class MotionSensor {
  readonly buffer = new SampleBuffer(4096); // ~40 s at 100 Hz
  private state: MotionState = 'idle';
  private reportedIntervalMs: number | null = null;
  private listeners = new Set<Listener>();
  private sampleListeners = new Set<SampleListener>();
  private noDataTimer: number | undefined;
  private snapshotTimer: number | undefined;
  private snapshot: MotionSnapshot = this.makeSnapshot();

  /** Subscribe to (throttled) state / stats changes. Used by React via useSyncExternalStore. */
  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snapshot;

  /** Subscribe to every raw sample (for step detection / sending later). */
  onSample(fn: SampleListener) {
    this.sampleListeners.add(fn);
    return () => this.sampleListeners.delete(fn);
  }

  /**
   * Start listening. Call this DIRECTLY from a click/tap handler (important on iOS).
   */
  start(): void {
    if (this.state === 'running' || this.state === 'waiting' || this.state === 'requesting') return;
    if (!window.isSecureContext) return this.setState('insecure');
    const DME = window.DeviceMotionEvent as unknown as IOSMotionEvent | undefined;
    if (!DME) return this.setState('unsupported');

    if (typeof DME.requestPermission === 'function') {
      // iOS: this call must be the first async thing in the tap handler.
      this.setState('requesting');
      DME.requestPermission()
        .then((result) => (result === 'granted' ? this.listen() : this.setState('denied')))
        .catch(() => this.setState('denied'));
    } else {
      this.listen();
    }
  }

  stop(): void {
    window.removeEventListener('devicemotion', this.handleMotion);
    window.clearTimeout(this.noDataTimer);
    window.clearInterval(this.snapshotTimer);
    this.setState('idle');
  }

  private listen() {
    window.addEventListener('devicemotion', this.handleMotion);
    this.setState('waiting');
    const startTotal = this.buffer.total;
    this.noDataTimer = window.setTimeout(() => {
      if (this.buffer.total === startTotal) this.setState('no-data');
    }, NO_DATA_TIMEOUT_MS);
    // Refresh the stats a few times a second (not per sample: that would re-render 100x/s).
    window.clearInterval(this.snapshotTimer);
    this.snapshotTimer = window.setInterval(() => this.publish(), 250);
  }

  private handleMotion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    // Some desktop browsers fire one event full of nulls: ignore it.
    if (!a || a.x == null || a.y == null || a.z == null) return;

    // e.timeStamp uses the same clock as performance.now() in modern browsers and is closer to
    // when the sensor actually fired. Fall back to performance.now() if it looks wrong.
    const now = performance.now();
    const t = Math.abs(e.timeStamp - now) < 1000 ? e.timeStamp : now;

    this.buffer.push(t, a.x, a.y, a.z);
    if (e.interval) this.reportedIntervalMs = e.interval;
    for (const fn of this.sampleListeners) fn(t, a.x, a.y, a.z);

    if (this.state !== 'running') {
      window.clearTimeout(this.noDataTimer);
      this.setState('running');
    }
  };

  private setState(s: MotionState) {
    this.state = s;
    this.publish();
  }

  private makeSnapshot(): MotionSnapshot {
    const b = this.buffer;
    let latest: MotionSnapshot['latest'] = null;
    if (b.count) {
      const i = b.indexFromNewest(0);
      const x = b.x[i],
        y = b.y[i],
        z = b.z[i];
      latest = { x, y, z, mag: Math.hypot(x, y, z) };
    }
    return {
      state: this.state,
      rateHz: b.rateHz(),
      reportedIntervalMs: this.reportedIntervalMs,
      total: b.total,
      latest,
    };
  }

  private publish() {
    this.snapshot = this.makeSnapshot();
    for (const fn of this.listeners) fn();
  }
}

/** The one shared motion sensor for the whole app. */
export const motion = new MotionSensor();
