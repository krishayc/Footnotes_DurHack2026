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
 */
import * as Tone from 'tone';
import { Store } from '../../shared/store';

export interface Beat {
  /** performance.now() time the beat is heard, ms. */
  t: number;
  /** Audio-clock time of the beat, seconds (for steadiness checks). */
  audioTime: number;
  index: number;
  /** 0..3 within a 4-beat bar. */
  beatInBar: number;
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
    volumeDb: -6,
  });
  /** Recent and just-scheduled beats, oldest first. */
  readonly beats: Beat[] = [];
  private beatListeners = new Set<(b: Beat) => void>();
  private built = false;
  private kick!: Tone.MembraneSynth;
  private tick!: Tone.NoiseSynth;
  private master!: Tone.Volume;
  private beatIndex = 0;
  private repeatId: number | null = null;
  /** Smoothed (performance.now() ms) − (audio clock ms) for heard sound. */
  private clockMap: number | null = null;

  onBeat(fn: (b: Beat) => void) {
    this.beatListeners.add(fn);
    return () => this.beatListeners.delete(fn);
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
    transport.stop();
    transport.cancel();
    transport.bpm.value = tempo;
    this.beatIndex = 0;
    this.beats.length = 0;
    this.repeatId = transport.scheduleRepeat((time) => this.onTransportBeat(time), '4n', 0);
    transport.start('+0.15');
    this.state.set({ playing: true, tempo });
  }

  stop() {
    const transport = Tone.getTransport();
    transport.stop();
    if (this.repeatId !== null) transport.clear(this.repeatId);
    this.repeatId = null;
    this.state.set({ playing: false });
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

    // L0 pulse body: a soft, warm "thump". D2 (key of D) with a short downward pitch sweep,
    // low-passed so it is round rather than clicky. Pitched high enough for laptop speakers.
    const kickFilter = new Tone.Filter({ frequency: 900, type: 'lowpass', rolloff: -24 });
    this.kick = new Tone.MembraneSynth({
      pitchDecay: 0.035,
      octaves: 2.5,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.42, sustain: 0, release: 0.2 },
      volume: -2,
    }).chain(kickFilter, this.master);

    // A subtle soft "tick" on top for a crisp timing edge; a little stronger on beat 1.
    const tickFilter = new Tone.Filter({ frequency: 2600, type: 'bandpass', Q: 1.2 });
    this.tick = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.02 },
      volume: -22,
    }).chain(tickFilter, this.master);

    this.built = true;
  }

  private onTransportBeat(time: number) {
    const beatInBar = this.beatIndex % BEATS_PER_BAR;
    this.kick.triggerAttackRelease('D2', '8n', time, beatInBar === 0 ? 1 : 0.85);
    this.tick.triggerAttackRelease('32n', time, beatInBar === 0 ? 1 : 0.55);

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
