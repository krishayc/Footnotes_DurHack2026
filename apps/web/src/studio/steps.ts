/**
 * Where the Studio's steps come from. Three interchangeable sources feed one "step bus":
 *
 *  - Live phone:        steps from the phone, converted to laptop time with the clock offset.
 *  - Tap mode:          spacebar or the big Tap button counts as a step (fallback if the phone
 *                       link fails at the demo table).
 *  - Simulated walker:  a built-in walker with adjustable pace and timing jitter (demo without
 *                       anyone walking).
 *
 * Everything downstream (calibration, sync scoring, music, visuals) only listens to the bus,
 * so it can't tell which source is active. All times are laptop performance.now() ms.
 */
import { Store, loadJSON, saveJSON } from '../shared/store';
import type { StudioLink } from './link';

export type StepMode = 'live' | 'tap' | 'sim';

export interface BusStep {
  /** Laptop time when the foot landed, ms. */
  t: number;
  inferred: boolean;
  source: StepMode;
}

interface StepSettings {
  mode: StepMode;
  simSpm: number;
  /** Step-to-step timing variability, fraction (0.04 = ±4%). */
  simJitter: number;
}

const KEY = 'footnotes.studio.steps.v1';
/** Rough phone-to-laptop delay used only before the first clock estimate exists. */
const FALLBACK_LATENCY_MS = 150;

class StepBus {
  readonly settings = new Store<StepSettings>(
    loadJSON<StepSettings>(KEY, { mode: 'live', simSpm: 100, simJitter: 0.04 }),
  );
  /** Recent steps, oldest first. */
  readonly recent: BusStep[] = [];
  /** Steps since the page opened. */
  total = 0;
  private listeners = new Set<(s: BusStep) => void>();
  private simTimer: number | undefined;
  private simNext = 0;
  private detachLink: (() => void) | null = null;

  constructor() {
    this.settings.subscribe(() => {
      saveJSON(KEY, this.settings.get());
      this.applyMode();
    });
    this.applyMode();
  }

  onStep(fn: (s: BusStep) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setMode(mode: StepMode) {
    if (mode !== this.settings.get().mode) this.settings.set({ mode });
  }

  /** Connect the live phone link (called by the Studio page). */
  attachLink(link: StudioLink) {
    this.detachLink?.();
    this.detachLink = link.onStep((s) => {
      if (this.settings.get().mode !== 'live') return;
      const t = link.toLocal(s.phoneT) ?? s.receivedAt - FALLBACK_LATENCY_MS;
      this.emit({ t, inferred: s.inferred, source: 'live' });
    });
    return () => {
      this.detachLink?.();
      this.detachLink = null;
    };
  }

  /** Tap mode: count a step at time t (use the input event's timeStamp for accuracy). */
  tap(t = performance.now()) {
    if (this.settings.get().mode !== 'tap') return;
    this.emit({ t, inferred: false, source: 'tap' });
  }

  private emit(step: BusStep) {
    this.total++;
    this.recent.push(step);
    if (this.recent.length > 512) this.recent.shift();
    for (const fn of this.listeners) fn(step);
  }

  private applyMode() {
    const { mode } = this.settings.get();
    if (mode === 'sim' && this.simTimer === undefined) {
      this.simNext = performance.now() + 400;
      // Check often and emit each step stamped with its exact planned time, so timer
      // sloppiness doesn't add fake jitter.
      this.simTimer = window.setInterval(() => this.simTick(), 5);
    } else if (mode !== 'sim' && this.simTimer !== undefined) {
      window.clearInterval(this.simTimer);
      this.simTimer = undefined;
    }
  }

  private simTick() {
    const now = performance.now();
    while (this.simNext <= now) {
      this.emit({ t: this.simNext, inferred: false, source: 'sim' });
      const { simSpm, simJitter } = this.settings.get();
      const gauss =
        Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
      this.simNext += (60000 / simSpm) * (1 + gauss * simJitter);
    }
  }
}

export const stepBus = new StepBus();
