/**
 * The arranger: at every bar line, turn the sync score into which layers play.
 * Rules (hysteresis, one layer up / up to two down per bar) live in
 * packages/shared/src/dsp/arrangement.ts and are unit-tested.
 *
 * Debug controls (for tuning the music without walking): a fake score, and forcing any layer
 * on or off.

 */
import * as Tone from 'tone';
import { LAYER_COUNT, stepLevel, targetLevel } from '@footnotes/shared';
import { Store } from '../../shared/store';
import { audio } from '../audio/engine';
import { sync } from '../sync';

export type Force = 'auto' | 'on' | 'off';

export interface ArrangerState {
  /** How many layers (above the pulse) the score has earned, 0..5. */
  level: number;
  /** Which layers are actually playing (after forcing). */
  on: boolean[];
  /** Debug: use this score instead of the real one. */
  fakeScore: number | null;
  forced: Force[];
  /** Score used at the last bar line. */
  lastScore: number;
  bar: number;
}

class Arranger {
  // The arranger's own copy (updated immediately); `state` is the on-screen copy, updated
  // when each bar is actually heard.
  private level = 0;
  private on: boolean[] = Array(LAYER_COUNT).fill(false);
  readonly state = new Store<ArrangerState>({
    level: 0,
    on: Array(LAYER_COUNT).fill(false),
    fakeScore: null,
    forced: Array(LAYER_COUNT).fill('auto'),
    lastScore: 0,
    bar: 0,
  });

  constructor() {
    audio.onBar((time, bar) => this.onBar(time, bar));
    audio.onStop(() => {
      this.level = 0;
      this.on = Array(LAYER_COUNT).fill(false);
      this.state.set({ level: 0, on: this.on });
    });
  }

  /** The score that drives the layers: the debug fake score, or how in step they are. */
  private currentScore(): number {
    const fake = this.state.get().fakeScore;
    if (fake !== null) return fake;
    return sync.state.get().score;
  }

  setFakeScore(score: number | null) {
    this.state.set({ fakeScore: score });
  }

  setForce(index: number, force: Force) {
    const forced = [...this.state.get().forced];
    forced[index] = force;
    this.state.set({ forced });
  }

  resetDebug() {
    this.state.set({ fakeScore: null, forced: Array(LAYER_COUNT).fill('auto') });
  }

  private onBar(time: number, bar: number) {
    const st = this.state.get();
    const score = this.currentScore();
    const level = stepLevel(this.level, targetLevel(score, this.level));
    const on = st.forced.map((f, i) => (f === 'on' ? true : f === 'off' ? false : i < level));

    const band = audio.band;
    const prev = this.on;
    if (band) on.forEach((v, i) => v !== prev[i] && band.setLayer(i, v, time));
    this.level = level;
    this.on = on;

    // Update the screen when the bar is actually heard, not ~0.1 s early.
    atAudioTime(() => this.state.set({ level, on, lastScore: score, bar }), time);
  }
}

/**
 * Run fn when the audio at `time` is heard. (Not Tone's Draw: it silently drops callbacks
 * that run more than 0.25 s late, which happens whenever the tab isn't being painted, and
 * then the screen and the phone would show the wrong state.)
 */
function atAudioTime(fn: () => void, time: number) {
  window.setTimeout(fn, Math.max(0, (time - Tone.now()) * 1000));
}

export const arranger = new Arranger();
