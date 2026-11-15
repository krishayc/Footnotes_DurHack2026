/**
 * Replay a real freezing-of-gait episode from the Daphnet dataset through the live pipeline.
 *
 * The clip (apps/web/public/replays/*.json, made by `npm run daphnet`) holds the acceleration
 * magnitude from three body-worn sensors at 64 Hz, plus where the physiotherapists marked
 * the freeze. We play it back in real time:
 *   - the thigh signal goes through our step detector (the closest sensor to a trouser
 *     pocket), and the steps go onto the step bus like a phone's would;
 *   - the chosen sensor's signal goes through the freeze index (freeze.ts);
 *   - the beat is set from the patient's pace before the freeze.
 * Everything downstream (music, visual score) can't tell it from a live walk.
 *
 * The patient in the recording could not hear our beat, so in replay the music follows
 * whether they are walking (steps arriving at their pace), not how well they are in step.
 */
import { StepDetector, tempoFromCadence } from '@footnotes/shared';
import { Store } from '../shared/store';
import { audio } from './audio/engine';
import { freezeWatch, type FreezeSensor } from './freeze';
import { session } from './session';
import { stepBus } from './steps';

export interface ClipMeta {
  id: string;
  title: string;
  subject: number;
  rateHz: number;
  durationS: number;
  cadenceSpm: number;
  freezes: [number, number][];
}
interface Clip extends ClipMeta {
  signals: Record<FreezeSensor, number[]>;
}

export interface ReplayState {
  clips: ClipMeta[];
  clipId: string | null;
  sensor: FreezeSensor;
  status: 'idle' | 'loading' | 'playing' | 'done' | 'error';
  error: string | null;
  /** Seconds into the clip. */
  pos: number;
  durationS: number;
  /** Ground truth (annotated) freezes, seconds. */
  freezes: [number, number][];
  /** What we detected, seconds. */
  detections: [number, number][];
  stepsFound: number;
}

const base = import.meta.env.BASE_URL ?? '/';

class ReplayPlayer {
  readonly state = new Store<ReplayState>({
    clips: [],
    clipId: null,
    sensor: 'ankle',
    status: 'idle',
    error: null,
    pos: 0,
    durationS: 0,
    freezes: [],
    detections: [],
    stepsFound: 0,
  });
  private clip: Clip | null = null;
  private cache = new Map<string, Clip>();
  private timer: number | undefined;
  private startAt = 0;
  private next = 0;
  private steps: StepDetector | null = null;
  private recentSteps: number[] = [];

  constructor() {
    // Leaving replay mode stops the replay.
    stepBus.settings.subscribe(() => {
      if (stepBus.settings.get().mode !== 'replay' && this.clip) {
        this.stop();
        this.clip = null;
      }
    });
  }

  async loadIndex() {
    if (this.state.get().clips.length) return;
    try {
      const res = await fetch(`${base}replays/index.json`);
      const clips = (await res.json()) as ClipMeta[];
      this.state.set({ clips, clipId: this.state.get().clipId ?? clips[0]?.id ?? null });
    } catch {
      this.state.set({ status: 'error', error: 'Could not load the replay list.' });
    }
  }

  select(clipId: string) {
    this.stop();
    this.state.set({ clipId, status: 'idle', pos: 0, detections: [] });
  }

  setSensor(sensor: FreezeSensor) {
    const wasPlaying = this.state.get().status === 'playing';
    this.state.set({ sensor });
    if (wasPlaying) void this.play();
  }

  async play() {
    const { clipId, sensor } = this.state.get();
    if (!clipId) return;
    this.stop();
    this.state.set({ status: 'loading', error: null });
    let clip = this.cache.get(clipId);
    if (!clip) {
      try {
        const res = await fetch(`${base}replays/${clipId}.json`);
        clip = (await res.json()) as Clip;
        this.cache.set(clipId, clip);
      } catch {
        this.state.set({ status: 'error', error: 'Could not load that recording.' });
        return;
      }
    }
    this.clip = clip;

    stepBus.setMode('replay');
    // The beat: just above the patient's pace before the freeze (kept within the demo range).
    const { tempo } = tempoFromCadence(clip.cadenceSpm, session.state.get().offset);
    session.useFixedTempo(tempo);
    if (audio.state.get().status === 'on') session.startBeat();

    freezeWatch.startReplay(sensor);
    this.steps = new StepDetector({}, (s) => {
      stepBus.replayStep(s.t);
      this.recentSteps.push(s.t);
      if (this.recentSteps.length > 32) this.recentSteps.shift();
      this.state.set({ stepsFound: this.state.get().stepsFound + 1 });
    });
    this.recentSteps = [];
    this.startAt = performance.now() + 200;
    this.next = 0;
    this.state.set({
      status: 'playing',
      pos: 0,
      durationS: clip.durationS,
      freezes: clip.freezes,
      detections: [],
      stepsFound: 0,
    });
    // Feed samples in real time, each stamped with its exact time in the recording.
    this.timer = window.setInterval(() => this.tick(), 20);
  }

  stop() {
    window.clearInterval(this.timer);
    this.timer = undefined;
    if (this.state.get().status === 'playing') this.state.set({ status: 'idle' });
    freezeWatch.stopReplay();
  }

  /** 0..1: is the patient walking at their pace right now? (Drives the music in replay.) */
  walkScore(): number {
    if (this.state.get().status !== 'playing' || !this.clip) return 0;
    const now = performance.now();
    const n = this.recentSteps.filter((t) => t > now - 4000).length;
    const expected = (4 * this.clip.cadenceSpm) / 60;
    return Math.min(1, n / (expected * 0.8)) * (freezeWatch.state.get().freezing ? 0 : 1);
  }

  private tick() {
    const clip = this.clip;
    if (!clip) return;
    const now = performance.now();
    const dt = 1000 / clip.rateHz;
    const { sensor } = this.state.get();
    const sig = clip.signals[sensor];
    const thigh = clip.signals.thigh;
    while (this.next < sig.length && this.startAt + this.next * dt <= now) {
      const t = this.startAt + this.next * dt;
      this.steps?.push(t, 0, thigh[this.next], 0);
      freezeWatch.feedReplay(t, sig[this.next]);
      this.next++;
    }
    const pos = Math.max(0, (now - this.startAt) / 1000);
    // Detected stretches, in clip seconds.
    const det = [...this.state.get().detections];
    const flag = freezeWatch.state.get().cause === 'replay';
    const last = det[det.length - 1];
    if (flag) {
      if (last && pos - last[1] < 0.6) last[1] = pos;
      else det.push([pos, pos]);
    }
    this.state.set({ pos: Math.min(pos, clip.durationS), detections: det });
    if (this.next >= sig.length) {
      window.clearInterval(this.timer);
      this.timer = undefined;
      this.state.set({ status: 'done' });
    }
  }
}

export const replay = new ReplayPlayer();
