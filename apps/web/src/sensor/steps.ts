/**
 * Runs the shared StepDetector on the phone's live motion samples.
 *
 * - Settings are saved in localStorage so tuning survives a reload.
 * - Keeps recent detector output (for the graph) and recent steps (for markers).
 * - Other parts of the app (Stage 3: sending to the laptop) subscribe with onStep().
 */
import { useSyncExternalStore } from 'react';
import {
  DEFAULT_STEP_SETTINGS,
  StepDetector,
  type DetectedStep,
  type StepDetectorSettings,
} from '@footnotes/shared';
import { motion } from './motion';
import { FrameBuffer } from './SampleBuffer';

const STORAGE_KEY = 'footnotes.stepSettings.v1';

function loadSettings(): StepDetectorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw)
      return { ...DEFAULT_STEP_SETTINGS, ...(JSON.parse(raw) as Partial<StepDetectorSettings>) };
  } catch {
    /* storage blocked: use defaults */
  }
  return { ...DEFAULT_STEP_SETTINGS };
}

export interface StepSnapshot {
  count: number;
  cadenceSpm: number | null;
  oneLeg: boolean;
  settings: StepDetectorSettings;
  lastStepAt: number | null;
}

class StepTracker {
  readonly frames = new FrameBuffer(4096);
  /** Most recent steps (oldest first), for drawing markers. */
  readonly recent: DetectedStep[] = [];
  private detector: StepDetector;
  private listeners = new Set<() => void>();
  private stepListeners = new Set<(s: DetectedStep) => void>();
  private snapshot: StepSnapshot;
  private tickOnStep = false;
  private audio: AudioContext | null = null;

  constructor() {
    this.detector = new StepDetector(loadSettings(), this.handleStep);
    this.snapshot = this.makeSnapshot();
    motion.onSample((t, x, y, z) => {
      const f = this.detector.push(t, x, y, z);
      this.frames.push(f.t, f.filtered, f.threshold);
    });
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  onStep(fn: (s: DetectedStep) => void) {
    this.stepListeners.add(fn);
    return () => this.stepListeners.delete(fn);
  }

  updateSettings(patch: Partial<StepDetectorSettings>) {
    this.detector.setSettings(patch);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.detector.settings));
    } catch {
      /* ignore */
    }
    this.publish();
  }

  /** Delay of the smoothing filters (ms), so the graph can line the curve up with the markers. */
  get filterDelayMs() {
    return this.detector.filterDelayMs;
  }

  resetSettings() {
    this.updateSettings({ ...DEFAULT_STEP_SETTINGS });
  }

  resetCount() {
    this.detector.resetCount();
    this.recent.length = 0;
    this.publish();
  }

  /**
   * Optional: play a short tick on every detected step, so you can tune by ear with the phone
   * in your pocket. Must be switched on from a tap (browsers only allow audio after a tap).
   */
  setTick(on: boolean) {
    this.tickOnStep = on;
    if (on && !this.audio) {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audio = new Ctx();
    }
    void this.audio?.resume();
  }

  private tick() {
    const ctx = this.audio;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  }

  private handleStep = (step: DetectedStep) => {
    this.recent.push(step);
    if (this.recent.length > 64) this.recent.shift();
    if (this.tickOnStep && !step.inferred) this.tick();
    for (const fn of this.stepListeners) fn(step);
    this.publish();
  };

  private makeSnapshot(): StepSnapshot {
    const last = this.recent[this.recent.length - 1];
    return {
      count: this.detector.count,
      cadenceSpm: this.detector.cadenceSpm,
      oneLeg: this.detector.oneLeg,
      settings: { ...this.detector.settings },
      lastStepAt: last ? last.t : null,
    };
  }

  private publish() {
    this.snapshot = this.makeSnapshot();
    for (const fn of this.listeners) fn();
  }
}

export const steps = new StepTracker();

export function useSteps(): StepSnapshot {
  return useSyncExternalStore(steps.subscribe, steps.getSnapshot);
}
