/**
 * Synchronisation scoring: how well are the steps locking to the beat?
 *
 * 1. PHASE of each step: where it lands relative to the nearest beat, as a fraction of a beat
 *    from −0.5 to +0.5 (negative = early, positive = late, 0 = exactly on the beat). Think of the
 *    beat as a clock face: each step is a point on the circle at angle θ = 2π × phase.
 *
 * 2. CIRCULAR STATISTICS over the last ~10 steps (standard in sensorimotor synchronisation
 *    research). Average the steps as unit arrows on that circle:
 *      - mean resultant length R = length of the average arrow, 0..1.
 *        R ≈ 1: every step lands at the same point relative to the beat (locked in).
 *        R ≈ 0: steps land all over the place (no relationship with the beat).
 *      - mean phase = direction of the average arrow: consistently early or late.
 *    Why not a normal average? Phase wraps around: +0.49 and −0.49 are nearly the same moment
 *    (just either side of half-way), but their ordinary average, 0, says "on the beat".
 *
 * 3. TEMPO MATCH: their current pace ÷ the beat tempo. Within ±3% is fine; further off is
 *    penalised (over a short window, steps drifting slowly past the beat can still look
 *    tidy on the circle).
 *
 * 4. SCORE (0..1) = R × tempo factor × a gentle accuracy factor (stepping exactly between
 *    beats is "locked", but on the beat is the goal). R carries most of the weight.
 *    A constant small lag is normal (people tend to step slightly early) and costs little.
 *
 * EASY MODE (the Studio's default, for first-time walkers and demos): pace may be up to 8% off
 *    with no penalty (zero at 30%); being consistently early or late barely matters; the two
 *    legs are judged separately (a pocket phone feels the near and far leg at slightly
 *    different moments, which otherwise looks like uneven timing); and the score is lifted
 *    with a gentle curve (score^0.6), so "fairly in step" brings the first instruments in
 *    sooner. Full music still needs real locking in.
 *
 * 5. SMOOTHING: the score moves only part of the way toward each new value (an exponential
 *    moving average), and decays gently if the steps stop, so the music never flickers.
 */
import { median } from './stats';

export interface BeatLike {
  t: number;
}

export interface StepPhase {
  /** −0.5..+0.5 beats. */
  phase: number;
  /** Signed offset from the nearest beat, ms. */
  offsetMs: number;
  /** Local beat period used, ms. */
  periodMs: number;
}

/**
 * Phase of a step at time t against a sorted list of beat times. Beats beyond the end of the
 * list are extrapolated with fallbackPeriodMs (the beat is perfectly regular, so this is exact
 * unless the tempo is mid-glide).
 */
export function phaseAgainstBeats(
  t: number,
  beats: readonly BeatLike[],
  fallbackPeriodMs: number,
): StepPhase | null {
  if (beats.length === 0) return null;
  // Binary search for the last beat at or before t.
  let lo = 0;
  let hi = beats.length - 1;
  if (t < beats[0].t - fallbackPeriodMs) return null; // step is from before the beat started
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (beats[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  const i = lo;
  const before = beats[i].t <= t ? beats[i] : null;
  const period =
    i + 1 < beats.length
      ? beats[i + 1].t - beats[i].t
      : i > 0
        ? beats[i].t - beats[i - 1].t
        : fallbackPeriodMs;

  // Nearest beat (possibly an extrapolated one after the end of the log).
  const base = before ?? beats[0];
  const k = Math.round((t - base.t) / period);
  const nearest = base.t + k * period;
  const offsetMs = t - nearest;
  return { phase: offsetMs / period, offsetMs, periodMs: period };
}

export interface SyncStats {
  n: number;
  /** Mean resultant length, 0..1. */
  R: number;
  /** Mean phase, −0.5..+0.5 beats (negative = early). */
  meanPhase: number;
  /** Their pace, steps per minute (median of recent gaps). */
  cadenceSpm: number | null;
  /** cadence ÷ tempo. */
  tempoRatio: number | null;
  tempoFactor: number;
  accuracyFactor: number;
  /** Unsmoothed score, 0..1. */
  raw: number;
}

export const SYNC_WINDOW = 8;
export type SyncDifficulty = 'easy' | 'normal';
const EASY = { tolerance: 0.08, zeroAt: 0.3, accuracyFloor: 0.9, curve: 0.6 };
const MIN_STEPS = 4;
const TEMPO_TOLERANCE = 0.03;
const TEMPO_ZERO_AT = 0.15;

export function circularStats(phases: readonly number[]) {
  let c = 0;
  let s = 0;
  for (const p of phases) {
    c += Math.cos(2 * Math.PI * p);
    s += Math.sin(2 * Math.PI * p);
  }
  c /= phases.length;
  s /= phases.length;
  return { R: Math.hypot(c, s), meanPhase: Math.atan2(s, c) / (2 * Math.PI) };
}

/** Score a window of steps. phases and stepTimes are for the same recent steps, oldest first. */
export function syncStats(
  phases: readonly number[],
  stepTimes: readonly number[],
  tempoBpm: number,
  difficulty: SyncDifficulty = 'normal',
): SyncStats | null {
  if (phases.length < MIN_STEPS) return null;
  const easy = difficulty === 'easy';
  const all = circularStats(phases);
  const { meanPhase } = all;
  let R = all.R;
  if (easy) {
    // Each leg on its own: alternate steps are the same leg.
    const legA = phases.filter((_, i) => i % 2 === 0);
    const legB = phases.filter((_, i) => i % 2 === 1);
    if (legA.length >= 2 && legB.length >= 2)
      R = Math.max(R, (circularStats(legA).R + circularStats(legB).R) / 2);
  }

  const gaps: number[] = [];
  for (let i = 1; i < stepTimes.length; i++) {
    const g = stepTimes[i] - stepTimes[i - 1];
    if (g > 0 && g < 2500) gaps.push(g);
  }
  // Easy: pace from stride to stride (two steps), which ignores the near/far leg timing
  // difference that makes single step gaps alternate short-long.
  const strides: number[] = [];
  for (let i = 2; i < stepTimes.length; i++) {
    const g = stepTimes[i] - stepTimes[i - 2];
    if (g > 0 && g < 5000) strides.push(g / 2);
  }
  const cadenceSpm =
    easy && strides.length >= 2
      ? 60000 / median(strides)
      : gaps.length >= 2
        ? 60000 / median(gaps)
        : null;
  const tempoRatio = cadenceSpm ? cadenceSpm / tempoBpm : null;
  const mismatch = tempoRatio ? Math.abs(tempoRatio - 1) : 0;
  const tol = easy ? EASY.tolerance : TEMPO_TOLERANCE;
  const zeroAt = easy ? EASY.zeroAt : TEMPO_ZERO_AT;
  const tempoFactor = Math.max(0, Math.min(1, 1 - (mismatch - tol) / (zeroAt - tol)));
  // 1 on the beat, 0.5 exactly between beats (easy: 0.8).
  const floor = easy ? EASY.accuracyFloor : 0.75;
  const accuracyFactor = floor + (1 - floor) * Math.cos(2 * Math.PI * meanPhase);
  const product = R * tempoFactor * accuracyFactor;

  return {
    n: phases.length,
    R,
    meanPhase,
    cadenceSpm,
    tempoRatio,
    tempoFactor,
    accuracyFactor,
    raw: easy ? Math.pow(Math.max(0, product), EASY.curve) : product,
  };
}

export interface ScoredStep {
  t: number;
  phase: number;
  offsetMs: number;
  inferred: boolean;
}

/** Keeps the recent window, computes stats per step, and smooths the score over time. */
export class SyncScorer {
  readonly steps: ScoredStep[] = [];
  private _stats: SyncStats | null = null;
  private _score = 0;
  private lastStepT: number | null = null;
  /** Easy (forgiving) or normal scoring. */
  difficulty: SyncDifficulty = 'normal';

  constructor(
    private readonly window = SYNC_WINDOW,
    /** How far each new step moves the smoothed score toward the raw score (0..1). */
    private readonly smoothing = 0.3,
    /** No steps for this long = they've stopped; the score starts to fade. */
    private readonly idleMs = 2500,
    /** While idle, the score halves every this many ms. */
    private readonly halfLifeMs = 2000,
  ) {}

  get stats() {
    return this._stats;
  }
  get score() {
    return this._score;
  }

  /** Add a scored step. Inferred steps (the unfelt leg) count for pace but not for timing. */
  push(step: ScoredStep, tempoBpm: number) {
    this.steps.push(step);
    if (this.steps.length > 64) this.steps.shift();
    this.lastStepT = step.t;
    const recent = this.steps.slice(-this.window * 2);
    const real = recent.filter((s) => !s.inferred).slice(-this.window);
    const stats = syncStats(
      real.map((s) => s.phase),
      recent.slice(-this.window).map((s) => s.t),
      tempoBpm,
      this.difficulty,
    );
    this._stats = stats;
    if (stats) this._score += this.smoothing * (stats.raw - this._score);
  }

  /** Call regularly (e.g. 4×/s). Fades the score if the steps have stopped. */
  tick(now: number, dtMs: number) {
    if (this.lastStepT === null || now - this.lastStepT < this.idleMs) return;
    this._score *= Math.pow(0.5, dtMs / this.halfLifeMs);
  }

  reset() {
    this.steps.length = 0;
    this._stats = null;
    this._score = 0;
    this.lastStepT = null;
  }
}
