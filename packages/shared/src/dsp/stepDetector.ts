/**
 * Step detection from a pocket phone's accelerometer.
 *
 * Pipeline, run once per sample (a "streaming" algorithm, no look-ahead):
 *
 *  1. Magnitude   |a| = sqrt(x² + y² + z²). Works whichever way the phone sits in the pocket.
 *  2. Gravity     A slow moving average of |a| (about 1 s) tracks gravity (~9.8 m/s²).
 *                 Subtracting it leaves the "dynamic" acceleration: the jolts from walking.
 *  3. Smoothing   Two cascaded one-pole low-pass filters (~3.5 Hz) remove jitter but keep the
 *                 once-or-twice-a-second step rhythm.
 *  4. Threshold   Adaptive: running mean + k × running standard deviation of the smoothed
 *                 signal (over ~2 s), never below a minimum. A gentle walker and a heavy
 *                 stomper both get a threshold that suits them.
 *  5. Peaks       When the signal rises above the threshold we follow it up to its highest
 *                 point. When it falls again the peak is a step if
 *                   - it stands out enough from the dip before it (prominence), and
 *                   - it is not too soon after the previous step (refractory period, ~300 ms).
 *  6. Timing fix  Low-pass filters delay the signal slightly. We measure that delay once (see
 *                 measurePeakDelayMs) and subtract it so
 *                 the step time is as close as possible to the real foot strike. This matters
 *                 because Stage 5 compares step times with the beat to the millisecond.
 *  7. Legs        With one phone in one pocket you may feel every step, or mostly the steps
 *                 of the leg the phone is on. Default: every bump is one step. In 'one' mode
 *                 each bump is a stride: we count two steps and add an "inferred" step halfway
 *                 between strides. ('auto' guesses from the gap size; it can't tell a slow
 *                 two-leg walk from a fast one-leg walk, so it is not the default.)
 *  8. Cadence     Steps per minute = 60000 / median gap between recent steps. The median
 *                 ignores the odd missed or extra step, unlike an average.
 */
import { alphaFromTau, median, tauFromCutoff } from './stats';

export type LegMode = 'auto' | 'both' | 'one';

export interface StepDetectorSettings {
  /** Low-pass cutoff, Hz. Lower = smoother but slower to react. */
  lowpassHz: number;
  /** Threshold = mean + thresholdK × std of the smoothed signal. */
  thresholdK: number;
  /** Threshold never goes below this (m/s²): stops a still phone counting noise as steps. */
  minAmplitude: number;
  /** How much a peak must rise above the dip before it (m/s²). */
  minProminence: number;
  /** No two steps closer than this (ms). */
  refractoryMs: number;
  /** Whether each peak is one step ('both'), one stride ('one'), or decide automatically. */
  legMode: LegMode;
}

export const DEFAULT_STEP_SETTINGS: StepDetectorSettings = {
  lowpassHz: 3.5,
  thresholdK: 0.6,
  minAmplitude: 0.5,
  minProminence: 0.8,
  refractoryMs: 300,
  // 'both' by default: tested on a real walk, 'auto' mistook slow walking (about 1 s per
  // step, common with Parkinson's) for one-leg strides and doubled the pace. A slow walk with
  // both legs felt and a faster walk with one leg felt look the same, so we don't guess:
  // the Studio has a switch if a pocket only picks up one leg.
  legMode: 'both',
};

/** Allowed ranges for the tuning panel. */
export const STEP_SETTING_RANGES = {
  lowpassHz: { min: 2, max: 6, step: 0.5, unit: 'Hz' },
  thresholdK: { min: 0, max: 1.5, step: 0.1, unit: '' },
  minAmplitude: { min: 0.1, max: 2, step: 0.1, unit: 'm/s²' },
  minProminence: { min: 0.2, max: 3, step: 0.1, unit: 'm/s²' },
  refractoryMs: { min: 200, max: 600, step: 10, unit: 'ms' },
} as const;

export interface DetectedStep {
  /** Time of the step (ms, same clock as the input samples), filter delay removed. */
  t: number;
  /** Running step count, including inferred steps. */
  n: number;
  /** 0..1: how clearly the peak stood out. Inferred steps get 0. */
  confidence: number;
  /** True for the halfway step we add when only one leg is being felt. */
  inferred: boolean;
}

/** What the detector computed for one sample (used to draw the tuning graph). */
export interface DetectorFrame {
  t: number;
  /** Smoothed dynamic acceleration, m/s². */
  filtered: number;
  /** Current adaptive threshold, m/s². */
  threshold: number;
}

const GRAVITY_TAU_S = 1.0;
const STATS_TAU_S = 2.0;
/** Above this gap between peaks we suspect we're feeling strides, not steps (auto mode). */
const ONE_LEG_ENTER_MS = 950;
const ONE_LEG_EXIT_MS = 850;
/** A gap this long means the person stopped; start cadence afresh. */
const PAUSE_MS = 2500;
const INTERVAL_HISTORY = 10;

export class StepDetector {
  private s: StepDetectorSettings;
  private readonly onStep?: (step: DetectedStep) => void;

  // Filter state.
  private lastT: number | null = null;
  private gravity: number | null = null;
  private lp1 = 0;
  private lp2 = 0;
  private mean = 0;
  private variance = 0.25;

  // Peak-tracking state.
  private inPeak = false;
  private peakVal = 0;
  private peakT = 0;
  private trough = Infinity; // lowest value since the last peak ended
  private troughAtRise = 0;
  private lastPeakT: number | null = null;

  // Results.
  private peakIntervals: number[] = [];
  private _count = 0;
  private _oneLeg = false;
  private delayMs = 0;

  constructor(settings: Partial<StepDetectorSettings> = {}, onStep?: (s: DetectedStep) => void) {
    this.s = { ...DEFAULT_STEP_SETTINGS, ...settings };
    this.onStep = onStep;
    this.delayMs = measurePeakDelayMs(this.s.lowpassHz);
    this._oneLeg = this.s.legMode === 'one';
  }

  get settings(): Readonly<StepDetectorSettings> {
    return this.s;
  }
  setSettings(patch: Partial<StepDetectorSettings>) {
    this.s = { ...this.s, ...patch };
    this.delayMs = measurePeakDelayMs(this.s.lowpassHz);
    if (this.s.legMode !== 'auto') this._oneLeg = this.s.legMode === 'one';
  }

  get count() {
    return this._count;
  }
  /** True while each detected peak is being treated as a stride (one leg). */
  get oneLeg() {
    return this._oneLeg;
  }

  /** Steps per minute from the median recent gap, or null if not enough steps yet. */
  get cadenceSpm(): number | null {
    if (this.peakIntervals.length < 3) return null;
    const stepMs = median(this.peakIntervals) / (this._oneLeg ? 2 : 1);
    return 60000 / stepMs;
  }

  /** How much later the smoothed peak appears than the real jolt, in ms. */
  get filterDelayMs(): number {
    return this.delayMs;
  }

  resetCount() {
    this._count = 0;
    this.peakIntervals = [];
    this.lastPeakT = null;
  }

  /** Feed one accelerometer sample (t in ms, x/y/z in m/s² including gravity). */
  push(t: number, x: number, y: number, z: number): DetectorFrame {
    const mag = Math.sqrt(x * x + y * y + z * z);

    // Time since the previous sample. Clamp odd values (first sample, a pause in events).
    let dt = this.lastT === null ? 1 / 60 : (t - this.lastT) / 1000;
    if (!(dt > 0) || dt > 0.5) dt = 1 / 60;
    this.lastT = t;

    // 1-2. Remove gravity.
    if (this.gravity === null) this.gravity = mag;
    this.gravity += alphaFromTau(dt, GRAVITY_TAU_S) * (mag - this.gravity);
    const dynamic = mag - this.gravity;

    // 3. Two-stage low-pass.
    const a = alphaFromTau(dt, tauFromCutoff(this.s.lowpassHz));
    this.lp1 += a * (dynamic - this.lp1);
    this.lp2 += a * (this.lp1 - this.lp2);
    const f = this.lp2;

    // 4. Adaptive threshold from running mean and variance.
    const as = alphaFromTau(dt, STATS_TAU_S);
    const diff = f - this.mean;
    this.mean += as * diff;
    this.variance = (1 - as) * (this.variance + as * diff * diff);
    const threshold = Math.max(
      this.s.minAmplitude,
      this.mean + this.s.thresholdK * Math.sqrt(this.variance),
    );

    // 5. Peak tracking.
    if (!this.inPeak) {
      this.trough = Math.min(this.trough, f);
      if (f > threshold) {
        this.inPeak = true;
        this.peakVal = f;
        this.peakT = t;
        this.troughAtRise = this.trough;
      }
    } else {
      if (f > this.peakVal) {
        this.peakVal = f;
        this.peakT = t;
      }
      const fellBelow = f < threshold;
      const fellFar = this.peakVal - f > this.s.minProminence;
      if (fellBelow || fellFar) {
        this.inPeak = false;
        this.trough = f;
        this.considerPeak(this.peakT, this.peakVal - this.troughAtRise, threshold);
      }
    }

    return { t, filtered: f, threshold };
  }

  private considerPeak(peakT: number, prominence: number, threshold: number) {
    if (prominence < this.s.minProminence) return;
    if (this.lastPeakT !== null && peakT - this.lastPeakT < this.s.refractoryMs) return;

    const t = peakT - this.filterDelayMs; // 6. timing fix
    const prevT = this.lastPeakT;
    const gap = prevT === null ? null : peakT - prevT;
    this.lastPeakT = peakT;

    if (gap !== null && gap > PAUSE_MS)
      this.peakIntervals = []; // they had stopped
    else if (gap !== null) {
      this.peakIntervals.push(gap);
      if (this.peakIntervals.length > INTERVAL_HISTORY) this.peakIntervals.shift();
    }

    // 7. Decide whether each peak is a step or a stride.
    if (this.s.legMode === 'auto' && this.peakIntervals.length >= 3) {
      const m = median(this.peakIntervals);
      if (!this._oneLeg && m > ONE_LEG_ENTER_MS) this._oneLeg = true;
      else if (this._oneLeg && m < ONE_LEG_EXIT_MS) this._oneLeg = false;
    }

    const confidence = Math.max(0, Math.min(1, prominence / (threshold * 3)));
    if (this._oneLeg && gap !== null && gap <= PAUSE_MS) {
      // The other foot landed roughly halfway through the stride.
      this.emit({ t: t - gap / 2, n: ++this._count, confidence: 0, inferred: true });
    }
    this.emit({ t, n: ++this._count, confidence, inferred: false });
  }

  private emit(step: DetectedStep) {
    this.onStep?.(step);
  }
}

/**
 * Measure (rather than guess) how much the two low-pass filters delay a typical heel-strike
 * jolt: run a short bell-shaped pulse (about 35 ms wide, like a real heel strike) through the
 * same filters at 1 ms resolution and see how much later the output peaks.
 */
export function measurePeakDelayMs(lowpassHz: number): number {
  const a = alphaFromTau(0.001, tauFromCutoff(lowpassHz));
  let lp1 = 0;
  let lp2 = 0;
  let best = -Infinity;
  let bestT = 0;
  const pulseAt = 200;
  for (let t = 0; t < 1000; t++) {
    const x = Math.exp(-0.5 * ((t - pulseAt) / 35) ** 2);
    lp1 += a * (x - lp1);
    lp2 += a * (lp1 - lp2);
    if (lp2 > best) {
      best = lp2;
      bestT = t;
    }
  }
  return bestT - pulseAt;
}
