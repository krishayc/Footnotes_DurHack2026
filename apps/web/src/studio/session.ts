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
  /** The page was refreshed mid-walk: one click should bring the music back. */
  resumePending: boolean;
}

/**
 * Survive a page refresh: keep the walk (pace, beat, whether the beat was playing) in
 * sessionStorage for this tab. Browsers won't let a refreshed page make sound until someone
 * clicks, so after a refresh the Studio offers a single "click to bring the music back".
 */
const LIVE_KEY = 'footnotes.studio.live.v1';
interface LiveSave {
  ready: boolean;
  baseline: number | null;
  tempo: number;
  manual: boolean;
  playing: boolean;
}
function loadLive(): LiveSave | null {
  try {
    const raw = sessionStorage.getItem(LIVE_KEY);
    return raw ? (JSON.parse(raw) as LiveSave) : null;
  } catch {
    return null;
  }
}
const live = loadLive();

const KEY = 'footnotes.studio.session.v1';
const saved = loadJSON(KEY, { offset: DEFAULT_OFFSET });

class Session {
  readonly state = new Store<SessionState>({
    phase: live?.ready ? 'ready' : 'idle',
    calStartedAt: null,
    calStepCount: 0,
    result: null,
    baseline: live?.baseline ?? null,
    offset: saved.offset,
    tempo: live?.tempo ?? 100,
    manual: live?.manual ?? false,
    resumePending: !!live?.playing,
  });

  constructor() {
    const persist = () => {
      const st = this.state.get();
      const a = audio.state.get();
      const save: LiveSave = {
        ready: st.phase === 'ready',
        baseline: st.baseline,
        tempo: st.tempo,
        manual: st.manual,
        // Keep "was playing" while a resume is pending, so a second refresh still offers it.
        playing: a.playing || st.resumePending,
      };
      try {
        sessionStorage.setItem(LIVE_KEY, JSON.stringify(save));
      } catch {
        /* ignore */
      }
    };
    this.state.subscribe(persist);
    audio.state.subscribe(persist);
  }

  /** After a refresh: turn the sound back on and restart the beat (call from a click). */
  async resume() {
    await audio.start();
    this.state.set({ resumePending: false });
    if (this.state.get().phase === 'ready' && audio.state.get().status === 'on') this.startBeat();
  }

  dismissResume() {
    this.state.set({ resumePending: false });
  }
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
