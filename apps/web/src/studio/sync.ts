/**
 * Scores every step against the beat while the beat is playing (maths in
 * packages/shared/src/dsp/sync.ts). The smoothed score drives the music in Stage 6.
 */
import {
  SyncScorer,
  phaseAgainstBeats,
  type SyncDifficulty,
  type SyncStats,
} from '@footnotes/shared';
import { Store, loadJSON, saveJSON } from '../shared/store';
import { audio } from './audio/engine';
import { stepBus, type BusStep } from './steps';

export interface SyncState {
  /** Smoothed score 0..1. */
  score: number;
  stats: SyncStats | null;
  /** Beat period when the stats were computed, ms (to show mean phase in ms). */
  periodMs: number;
  /**
   * Subtracted from every step time before scoring, ms. Compensates for constant delays
   * (speaker latency, detector timing) so "on the beat" really means on the beat.
   */
  correctionMs: number;
  active: boolean;
  /** Easy (default: forgiving, for first-time walkers) or strict scoring. */
  difficulty: SyncDifficulty;
}

const KEY = 'footnotes.studio.sync.v1';
const TICK_MS = 250;
const DIFF_KEY = 'footnotes.studio.difficulty.v1';

class SyncTracker {
  readonly scorer = new SyncScorer();
  readonly state = new Store<SyncState>({
    score: 0,
    stats: null,
    periodMs: 600,
    correctionMs: loadJSON(KEY, { correctionMs: 0 }).correctionMs,
    active: false,
    difficulty: loadJSON<{ difficulty: SyncDifficulty }>(DIFF_KEY, { difficulty: 'easy' })
      .difficulty,
  });
  /** Phase of each scored bus step, for colouring the dots. */
  readonly phaseOf = new WeakMap<BusStep, number>();

  constructor() {
    this.scorer.difficulty = this.state.get().difficulty;
    stepBus.onStep((s) => this.onStep(s));
    audio.state.subscribe(() => {
      const playing = audio.state.get().playing;
      if (playing !== this.state.get().active) {
        if (!playing) this.scorer.reset();
        this.state.set({ active: playing, score: this.scorer.score, stats: this.scorer.stats });
      }
    });
    window.setInterval(() => {
      if (!this.state.get().active) return;
      this.scorer.tick(performance.now(), TICK_MS);
      this.state.set({ score: this.scorer.score });
    }, TICK_MS);
  }

  setDifficulty(difficulty: SyncDifficulty) {
    saveJSON(DIFF_KEY, { difficulty });
    this.scorer.difficulty = difficulty;
    this.state.set({ difficulty });
  }

  setCorrection(ms: number) {
    saveJSON(KEY, { correctionMs: ms });
    this.state.set({ correctionMs: ms });
  }

  private onStep(s: BusStep) {
    const { playing, tempo } = audio.state.get();
    if (!playing) return;
    const t = s.t - this.state.get().correctionMs;
    const p = phaseAgainstBeats(t, audio.beats, audio.periodMs);
    if (!p) return;
    this.phaseOf.set(s, p.phase);
    this.scorer.push({ t, phase: p.phase, offsetMs: p.offsetMs, inferred: s.inferred }, tempo);
    this.state.set({ score: this.scorer.score, stats: this.scorer.stats, periodMs: p.periodMs });
  }
}

export const sync = new SyncTracker();

/** Colour for a step dot by timing: on time, a bit off, or well off. (Words in the legend.) */
export function phaseColour(phase: number | undefined): string {
  if (phase === undefined) return '#9FB5AC';
  const a = Math.abs(phase);
  if (a <= 0.1) return '#7FD1A8'; // on time (within a tenth of a beat)
  if (a <= 0.25) return '#E7C98B'; // a bit early or late
  return '#6E9486'; // off the beat
}
