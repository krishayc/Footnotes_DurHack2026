/**
 * Record ~30 s of raw sensor data plus the steps detected, and send it to the laptop, which
 * saves it as recordings/walk-<time>.json. Lets us replay a real walk offline to see exactly
 * what the detector did and tune it (npm run analyze).
 */
import { Store } from '../shared/store';
import { motion } from './motion';
import { steps } from './steps';
import { buzz } from '../shared/haptic';

export const RECORD_MS = 30_000;

export interface RecorderState {
  status: 'idle' | 'recording' | 'sending' | 'sent' | 'error';
  startedAt: number | null;
  file: string | null;
  message: string | null;
}

class Recorder {
  readonly state = new Store<RecorderState>({
    status: 'idle',
    startedAt: null,
    file: null,
    message: null,
  });
  private samples: [number, number, number, number][] = [];
  private detected: { t: number; inferred: boolean }[] = [];
  private cleanups: (() => void)[] = [];
  private timer: number | undefined;

  start() {
    if (this.state.get().status === 'recording') return;
    this.samples = [];
    this.detected = [];
    const startedAt = performance.now();
    this.cleanups = [
      motion.onSample((t, x, y, z) =>
        this.samples.push([+t.toFixed(1), +x.toFixed(3), +y.toFixed(3), +z.toFixed(3)]),
      ),
      steps.onStep((s) => this.detected.push({ t: +s.t.toFixed(1), inferred: s.inferred })),
    ];
    this.state.set({ status: 'recording', startedAt, file: null, message: null });
    this.timer = window.setTimeout(() => void this.finish(), RECORD_MS);
  }

  cancel() {
    window.clearTimeout(this.timer);
    this.cleanups.forEach((f) => f());
    this.state.set({ status: 'idle', startedAt: null });
  }

  private async finish() {
    this.cleanups.forEach((f) => f());
    buzz([60, 80, 60]);
    this.state.set({ status: 'sending' });
    const snap = steps.getSnapshot();
    try {
      const res = await fetch('/api/recordings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recordedAt: new Date().toISOString(),
          device: navigator.userAgent,
          rateHz: motion.getSnapshot().rateHz,
          settings: snap.settings,
          oneLegAtEnd: snap.oneLeg,
          cadenceAtEnd: snap.cadenceSpm,
          samples: this.samples,
          steps: this.detected,
        }),
      });
      const j = (await res.json()) as { name?: string; error?: string };
      if (!res.ok || !j.name) throw new Error(j.error ?? `HTTP ${res.status}`);
      this.state.set({ status: 'sent', file: j.name, message: null });
    } catch (e) {
      this.state.set({
        status: 'error',
        message: e instanceof Error ? e.message : 'Could not send',
      });
    }
  }
}

export const recorder = new Recorder();
