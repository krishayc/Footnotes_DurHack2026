/**
 * The Footnotes audio engine (Stage 4: the steady pulse, layer L0).
 *
 * Timing: Tone.js's Transport schedules every beat on the AUDIO hardware clock, slightly
 * ahead of time (~0.1 s "lookahead"). Browser timers can be late by tens of ms when the page
 * is busy, but scheduled audio is sample-accurate, so the beat cannot waver. This is principle
 * 1: the beat leads, always steady.
 *
 * Beat log: for each beat we record WHEN IT WILL BE HEARD in performance.now() time, the same
 * clock the steps are on. To convert, we ask the browser which audio-clock moment is currently
 * coming out of the speakers (getOutputTimestamp), smoothed over time. Stage 5 compares every
 * step with this log.
 *
 * Tempo changes (offset tweaks, "a bit faster") glide over 4 beats instead of jumping.
 *
 * Music (Stage 6): an eighth-note clock drives the layers in music/band.ts; at each bar line
 * the arranger (music/arranger.ts) decides which layers should be playing.
 */
import * as Tone from 'tone';
import { createBand, type Band } from '../music/band';
import { Store, loadJSON, saveJSON } from '../../shared/store';

/** The Studio volume is remembered on this laptop. */
const VOLUME_KEY = 'footnotes.studio.volume.v1';

export interface Beat {
  /** performance.now() time the beat is heard, ms. */
  t: number;
  /** Audio-clock time of the beat, seconds (for steadiness checks). */
  audioTime: number;
  index: number;
  /** 0..3 within a 4-beat bar. */
  beatInBar: number;
}

/** A note played by a music layer, for the visual score (performance.now() times). */
export interface ScoreNote {
  layer: number; // 0 Shakers, 1 Bass, 2 Keys, 3 Melody, 4 Sparkle
  midi: number;
  t: number;
  durMs: number;
  vel: number;
  /** Was the layer audible (faded in)? Silent notes are not drawn. */
  audible: boolean;
}

export interface AudioState {
  status: 'off' | 'starting' | 'on' | 'blocked';
  playing: boolean;
  tempo: number;
  volumeDb: number;
}

const BEATS_PER_BAR = 4;
const RAMP_BEATS = 4;

class AudioEngine {
  readonly state = new Store<AudioState>({
    status: 'off',
    playing: false,
    tempo: 100,
    volumeDb: loadJSON(VOLUME_KEY, { db: -6 }).db,
  });
  /** Recent and just-scheduled beats, oldest first. */
  readonly beats: Beat[] = [];
  /** Recent notes from the music layers, oldest first (for the visual score). */
  readonly notes: ScoreNote[] = [];
  private beatListeners = new Set<(b: Beat) => void>();
  private built = false;
  private master!: Tone.Volume;
  band: Band | null = null;
  private beatIndex = 0;
  private eighthIndex = 0;
  private repeatIds: number[] = [];
  private barListeners = new Set<(time: number, bar: number) => void>();
  private stopListeners = new Set<() => void>();
  /** Smoothed (performance.now() ms) − (audio clock ms) for heard sound. */
  private clockMap: number | null = null;

  onBeat(fn: (b: Beat) => void) {
    this.beatListeners.add(fn);
    return () => this.beatListeners.delete(fn);
  }

  /** Called at the start of every bar (audio time), before that bar's notes are scheduled. */
  onBar(fn: (time: number, bar: number) => void) {
    this.barListeners.add(fn);
    return () => this.barListeners.delete(fn);
  }

  onStop(fn: () => void) {
    this.stopListeners.add(fn);
    return () => this.stopListeners.delete(fn);
  }

  /** Must be called from a click: browsers only allow audio after a user gesture. */
  async start() {
    if (this.state.get().status === 'on') return;
    this.state.set({ status: 'starting' });
    try {
      await Tone.start();
      this.build();
      this.state.set({ status: 'on' });
    } catch {
      this.state.set({ status: 'blocked' });
    }
  }

  /** Start the beat at a tempo, from beat 1 of a bar. */
  play(tempo: number) {
    if (this.state.get().status !== 'on') return;
    const transport = Tone.getTransport();
    this.clearSchedule();
    transport.stop();
    transport.bpm.value = tempo;
    this.beatIndex = 0;
    this.eighthIndex = 0;
    this.beats.length = 0;
    this.band?.layers.forEach((_, i) => this.band!.setLayer(i, false));
    this.repeatIds = [
      transport.scheduleRepeat((time) => this.onTransportBeat(time), '4n', 0),
      transport.scheduleRepeat((time) => this.onTransportEighth(time), '8n', 0),
    ];
    transport.start('+0.15');
    this.state.set({ playing: true, tempo });
  }

  stop() {
    const transport = Tone.getTransport();
    transport.stop();
    this.clearSchedule();
    this.band?.layers.forEach((_, i) => this.band!.setLayer(i, false));
    this.state.set({ playing: false });
    for (const fn of this.stopListeners) fn();
  }

  private clearSchedule() {
    const transport = Tone.getTransport();
    for (const id of this.repeatIds) transport.clear(id);
    this.repeatIds = [];
  }

  /** Change tempo smoothly (over 4 beats). Never call this per step: the beat leads. */
  setTempo(tempo: number) {
    const transport = Tone.getTransport();
    if (this.state.get().playing) {
      transport.bpm.rampTo(tempo, (RAMP_BEATS * 60) / tempo);
    } else transport.bpm.value = tempo;
    this.state.set({ tempo });
  }

  setVolume(db: number) {
    if (this.built) this.master.volume.rampTo(db, 0.2);
    this.state.set({ volumeDb: db });
    saveJSON(VOLUME_KEY, { db });
  }

  /** Current beat period in ms (follows ramps). */
  get periodMs() {
    return 60000 / Tone.getTransport().bpm.value;
  }

  private build() {
    if (this.built) return;
    // Gentle bus: compressor evens out levels, limiter prevents any harsh peak.
    const limiter = new Tone.Limiter(-1).toDestination();
    const comp = new Tone.Compressor({ threshold: -18, ratio: 3, attack: 0.01, release: 0.2 });
    this.master = new Tone.Volume(this.state.get().volumeDb);
    this.master.chain(comp, limiter);
    this.band = createBand(this.master, (layer, midi, time, durSec, vel, audible) => {
      this.notes.push({
        layer,
        midi,
        t: this.audioToPerf(time),
        durMs: durSec * 1000,
        vel,
        audible,
      });
      if (this.notes.length > 3000) this.notes.splice(0, 500);
    });
    this.built = true;
  }

  /** Every eighth note: tell the arranger about new bars, then let each layer play. */
  private onTransportEighth(time: number) {
    const slot = this.eighthIndex % 8;
    const bar = Math.floor(this.eighthIndex / 8);
    this.eighthIndex++;
    if (slot === 0) for (const fn of this.barListeners) fn(time, bar);
    const slotSec = 30 / Tone.getTransport().bpm.getValueAtTime(time);
    for (const layer of this.band?.layers ?? []) layer.play(time, bar, slot, slotSec);
  }

  /** Audio-clock time of the next beat (for changes that should land on a beat). */
  nextBeatTime(): number {
    return Tone.getTransport().nextSubdivision('4n');
  }

  private onTransportBeat(time: number) {
    const beatInBar = this.beatIndex % BEATS_PER_BAR;
    this.band?.playPulse(time, beatInBar);

    const beat: Beat = {
      t: this.audioToPerf(time),
      audioTime: time,
      index: this.beatIndex,
      beatInBar,
    };
    this.beatIndex++;
    this.beats.push(beat);
    if (this.beats.length > 256) this.beats.shift();
    for (const fn of this.beatListeners) fn(beat);
  }

  /** Audio-clock seconds -> performance.now() ms of when that moment is heard. */
  private audioToPerf(time: number): number {
    const ctx = Tone.getContext().rawContext as AudioContext;
    let map: number;
    const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
    if (ts && ts.performanceTime && ts.contextTime) {
      map = ts.performanceTime - ts.contextTime * 1000;
    } else {
      // Fallback: now, plus the known output latency.
      const latency = (ctx.outputLatency || ctx.baseLatency || 0) * 1000;
      map = performance.now() - ctx.currentTime * 1000 + latency;
    }
    // Smooth: the true mapping barely changes, individual readings jitter by a few ms.
    this.clockMap = this.clockMap === null ? map : this.clockMap + 0.05 * (map - this.clockMap);
    return time * 1000 + this.clockMap;
  }
}

export const audio = new AudioEngine();
