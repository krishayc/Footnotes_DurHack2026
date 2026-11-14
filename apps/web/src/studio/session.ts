/**
 * The Studio's walking session: calibration, then the steady beat.
 *
 *   idle ──Find their pace──▶ calibrating (20 s, no music) ──▶ ready (tempo chosen)
 *                                                               │
 *                                         Start the beat ◀──────┘  (L0 pulse plays)
 *
 * Tempo = baseline pace × (1 + offset), clamped to 70–130 BPM. After calibration the tempo
 * only changes when a person deliberately asks (offset slider, a bit slower / faster), and
 * then it glides over 4 beats. It never reacts to individual steps.
 */
import {
  CALIBRATION_MS,
  DEFAULT_OFFSET,
  TEMPO_MAX,
  TEMPO_MIN,
  calibrate,
  tempoFromCadence,
  type CalibrationResult,
} from '@footnotes/shared';
import * as Tone from 'tone';
import { Store, loadJSON, saveJSON } from '../shared/store';
import { audio } from './audio/engine';
import type { StudioLink } from './link';
import { stepBus } from './steps';

export type Phase = 'idle' | 'calibrating' | 'ready';

export interface SessionState {
  phase: Phase;
  calStartedAt: number | null;
  calStepCount: number;
  result: CalibrationResult | null;
  /** Baseline pace, steps per minute (from calibration or chosen manually). */
  baseline: number | null;
  offset: number;
  tempo: number;
  /** Tempo was nudged by hand after calibration. */
  manual: boolean;
}

const KEY = 'footnotes.studio.session.v1';
const saved = loadJSON(KEY, { offset: DEFAULT_OFFSET });

class Session {
  readonly state = new Store<SessionState>({
    phase: 'idle',
    calStartedAt: null,
    calStepCount: 0,
    result: null,
    baseline: null,
    offset: saved.offset,
    tempo: 100,
    manual: false,
  });
  private calSteps: number[] = [];
  private calTimer: number | undefined;
  private unsubStep: (() => void) | null = null;
  private link: StudioLink | null = null;

  attachLink(link: StudioLink | null) {
    this.link = link;
  }

  startCalibration() {
    audio.stop(); // no music while we measure natural pace
    this.cancelCalibration();
    const startedAt = performance.now();
    this.calSteps = [];
    this.state.set({
      phase: 'calibrating',
      calStartedAt: startedAt,
      calStepCount: 0,
      result: null,
    });
    this.link?.conn.send({ type: 'calibrationStart', durationMs: CALIBRATION_MS });

    this.unsubStep = stepBus.onStep((s) => {
      if (s.t < startedAt) return;
      this.calSteps.push(s.t);
      this.state.set({ calStepCount: this.calSteps.length });
    });
    this.calTimer = window.setTimeout(() => this.finishCalibration(), CALIBRATION_MS);
  }

  cancelCalibration() {
    window.clearTimeout(this.calTimer);
    this.unsubStep?.();
    this.unsubStep = null;
    if (this.state.get().phase === 'calibrating')
      this.state.set({ phase: 'idle', calStartedAt: null });
  }

  /** Skip calibration: use a fixed tempo (demo safety net, or a physio-set pace). */
  useFixedTempo(tempo = 100) {
    this.cancelCalibration();
    const baseline = tempo / (1 + this.state.get().offset);
    this.state.set({ phase: 'ready', baseline, tempo, result: null, manual: true });
    audio.setTempo(tempo);
  }

  setOffset(offset: number) {
    saveJSON(KEY, { offset });
    const { baseline } = this.state.get();
    if (baseline === null) {
      this.state.set({ offset });
      return;
    }
    const { tempo } = tempoFromCadence(baseline, offset);
    this.state.set({ offset, tempo, manual: false });
    audio.setTempo(tempo);
  }

  /** "A bit slower / a bit faster": a deliberate, small change. */
  nudgeTempo(deltaBpm: number) {
    const tempo = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, this.state.get().tempo + deltaBpm));
    this.state.set({ tempo, manual: true });
    audio.setTempo(tempo);
  }

  startBeat() {
    audio.play(this.state.get().tempo);
  }

  stopBeat() {
    audio.stop();
  }

  private finishCalibration() {
    this.unsubStep?.();
    this.unsubStep = null;
    const { offset } = this.state.get();
    const result = calibrate(this.calSteps, offset);
    this.state.set({
      phase: 'ready',
      calStartedAt: null,
      result,
      baseline: result.cadenceSpm,
      tempo: result.tempoBpm,
      manual: false,
    });
    audio.setTempo(result.tempoBpm);
    this.link?.conn.send({
      type: 'calibrationResult',
      cadenceSpm: result.cadenceSpm ?? 0,
      tempoBpm: result.tempoBpm,
      stepsCounted: result.stepsUsed,
      reliable: result.reliable,
    });
    chime();
  }
}

/** A soft two-note chime (D5 then A5) to say "done", if audio is on. Never loud. */
function chime() {
  if (audio.state.get().status !== 'on') return;
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.6, sustain: 0, release: 0.8 },
    volume: -16,
  }).toDestination();
  const now = Tone.now();
  synth.triggerAttackRelease('D5', 0.5, now);
  synth.triggerAttackRelease('A5', 0.7, now + 0.18);
  window.setTimeout(() => synth.dispose(), 2500);
}

export const session = new Session();
