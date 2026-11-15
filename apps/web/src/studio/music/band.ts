/**
 * The instruments: a small, warm early-60s ballad band, all synthesised with Tone.js (no
 * sample files: fully offline, no licences, nothing to download). Every voice is filtered,
 * enveloped and levelled by hand so nothing sounds harsh.
 *
 *   L0 Pulse        soft low thump + gentle tick          (always on, the timing reference)
 *   L1 Bongos       soft high/low bongos in a Latin lilt, with a light shaker
 *   L2 Bass         round, plucky upright-style bass
 *   L3 Guitar       nylon-string guitar, fingerpicked chords (plucked-string synthesis)
 *   L4 Flute        a breathy, gently vibrato flute carrying the tune
 *   L5 Guitar fills little guitar runs leading into the next bar
 *   Recovery        a soft marimba-like motif ON the beat (F A C A | G Bb C -), used only
 *                   while a freeze is detected: the same calm figure every time, so it is
 *                   recognisable, and it marks every beat to help the next step start.
 *
 * Each layer goes through its own "fader" (a gain from 0 to 1). The arranger fades layers in
 * and out on bar lines; the notes themselves keep playing silently underneath, so a layer
 * always enters perfectly in step with the others.
 */
import * as Tone from 'tone';
import {
  BONGO_PATTERN,
  SHAKER_VEL,
  bassBar,
  chordForBar,
  fillBar,
  guitarBar,
  melodyBar,
  nextChord,
  type NoteEvent,
} from './theory';

export interface Layer {
  id: number;
  name: string;
  fader: Tone.Gain;
  /** Called on every eighth-note slot. */
  play(time: number, bar: number, slot: number, slotSec: number): void;
}

export interface Band {
  playPulse(time: number, beatInBar: number): void;
  layers: Layer[];
  /** The freeze recovery motif (not one of the arranged layers). */
  recovery: Layer;
  setRecovery(on: boolean, time?: number): void;
  setLayer(index: number, on: boolean, time?: number): void;
  dispose(): void;
}

export const LAYER_NAMES = ['Bongos', 'Bass', 'Guitar', 'Flute', 'Guitar fills'] as const;
const FADE_IN_S = 0.25;
const FADE_OUT_S = 1.0;

/**
 * Mixer levels (dB), balanced by measuring each layer offline (see measureMix). Plucked
 * parts (guitar, fills, bongos) are short and spiky, so they're balanced by their peaks;
 * sustained parts (bass, flute) by their average loudness.
 */
export const LEVELS = {
  kick: -2,
  tick: -24,
  bongos: -5,
  shaker: -16,
  bass: -13,
  guitar: 2,
  flute: -14,
  fills: 6,
  recovery: -8,
};

/** The recovery motif: one note per beat, two bars (index = bar % 2, beat). null = rest. */
export const RECOVERY_MOTIF: (string | null)[][] = [
  ['F5', 'A5', 'C6', 'A5'],
  ['G5', 'Bb5', 'C6', null],
];
/** Index used for recovery notes in the visual score. */
export const RECOVERY_LAYER = 5;

/** Called for every note a layer plays (audio time), so the visual score can draw it. */
export type NoteHook = (
  layer: number,
  midi: number,
  time: number,
  durSec: number,
  vel: number,
  audible: boolean,
) => void;

export function createBand(destination: Tone.InputNode, onNote?: NoteHook): Band {
  /** Whether each layer is (being faded) on. */
  const audible: boolean[] = Array(5).fill(false);
  const midiOf = (note: string) => Tone.Frequency(note).toMidi();
  const nodes: { dispose(): unknown }[] = [];
  const keep = <T extends { dispose(): unknown }>(n: T) => (nodes.push(n), n);
  const human = () => 0.92 + Math.random() * 0.08; // tiny velocity variation: played, not stamped

  // Shared reverb as a "send": wet layers feed a little of their signal into it.
  const reverb = keep(new Tone.Reverb({ decay: 2.6, preDelay: 0.025, wet: 1 })).connect(
    destination,
  );
  const reverbSend = (amount: number) => keep(new Tone.Gain(amount)).connect(reverb);
  const fader = (wet: number) => {
    const g = keep(new Tone.Gain(0)).connect(destination);
    if (wet > 0) g.connect(reverbSend(wet));
    return g;
  };

  /** Play a bar's worth of note events that fall on this slot. */
  const playEvents = (
    layer: number,
    events: NoteEvent[],
    slot: number,
    slotSec: number,
    time: number,
    trigger: (note: string, dur: number, t: number, vel: number) => void,
  ) => {
    for (const [s, note, len, vel] of events) {
      if (s !== slot) continue;
      const v = vel * human();
      const dur = len * slotSec * 0.95;
      trigger(note, dur, time, v);
      onNote?.(layer, midiOf(note), time, dur, v, audible[layer]);
    }
  };

  /**
   * A pool of plucked strings (Karplus-Strong), each with its own volume, so chords can ring
   * together and every pluck can have its own loudness.
   */
  const strings = (count: number, opts: Partial<Tone.PluckSynthOptions>, out: Tone.InputNode) => {
    const pool = Array.from({ length: count }, () => {
      const gain = keep(new Tone.Gain(0.8)).connect(out);
      const synth = keep(new Tone.PluckSynth(opts)).connect(gain);
      return { synth, gain };
    });
    let next = 0;
    return (note: string, t: number, vel: number) => {
      const v = pool[next];
      next = (next + 1) % pool.length;
      v.gain.gain.setValueAtTime(vel, t);
      v.synth.triggerAttack(note, t);
    };
  };

  // ---------- L0 pulse ----------
  const kick = keep(
    new Tone.MembraneSynth({
      pitchDecay: 0.035,
      octaves: 2.5,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.42, sustain: 0, release: 0.2 },
      volume: LEVELS.kick,
    }),
  );
  kick.chain(keep(new Tone.Filter({ frequency: 900, type: 'lowpass', rolloff: -24 })), destination);
  const tick = keep(
    new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
      volume: LEVELS.tick,
    }),
  );
  tick.chain(keep(new Tone.Filter({ frequency: 2400, type: 'bandpass', Q: 1.2 })), destination);

  // ---------- L1 bongos + shaker ----------
  const bongoFader = fader(0.12);
  const bongoOut = keep(new Tone.Filter({ frequency: 2600, type: 'lowpass' })).connect(bongoFader);
  const bongo = (pan: number) =>
    keep(
      new Tone.MembraneSynth({
        pitchDecay: 0.012,
        octaves: 1.6,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.08 },
        volume: LEVELS.bongos,
      }),
    ).chain(keep(new Tone.Panner(pan)), bongoOut);
  const bongoHigh = bongo(0.3);
  const bongoLow = bongo(0.2);
  const shaker = keep(
    new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.004, decay: 0.05, sustain: 0, release: 0.03 },
      volume: LEVELS.shaker,
    }),
  );
  shaker.chain(
    keep(new Tone.Filter({ frequency: 6000, type: 'highpass' })),
    keep(new Tone.Filter({ frequency: 9500, type: 'lowpass' })),
    keep(new Tone.Panner(-0.3)),
    bongoFader,
  );

  // ---------- L2 bass ----------
  const bassFader = fader(0.04);
  const bass = keep(
    new Tone.MonoSynth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.008, decay: 0.5, sustain: 0.25, release: 0.3 },
      filter: { type: 'lowpass', Q: 0.8, rolloff: -24 },
      filterEnvelope: {
        attack: 0.004,
        decay: 0.18,
        sustain: 0.35,
        release: 0.3,
        baseFrequency: 130,
        octaves: 2.2,
      },
      volume: LEVELS.bass,
    }),
  );
  // Gentle saturation adds overtones so the bass line is audible on small speakers.
  const bassDrive = keep(new Tone.Chebyshev({ order: 2, wet: 0.2 }));
  bass.chain(bassDrive, keep(new Tone.Filter({ frequency: 1200, type: 'lowpass' })), bassFader);

  // ---------- L3 nylon guitar ----------
  const guitarFader = fader(0.22);
  const guitarBus = keep(new Tone.Volume(LEVELS.guitar));
  guitarBus.chain(
    keep(new Tone.Filter({ frequency: 2800, type: 'lowpass', rolloff: -12 })),
    keep(new Tone.Panner(-0.2)),
    guitarFader,
  );
  const guitar = strings(
    12,
    { attackNoise: 0.8, dampening: 3400, resonance: 0.94, release: 1 },
    guitarBus,
  );

  // ---------- L4 flute ----------
  const fluteFader = fader(0.35);
  const flute = keep(
    new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.07, decay: 0.2, sustain: 0.85, release: 0.5 },
      volume: LEVELS.flute,
    }),
  );
  // A touch of breath noise that follows the flute's notes.
  const breath = keep(
    new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.05, decay: 0.15, sustain: 0.15, release: 0.3 },
      volume: LEVELS.flute - 22,
    }),
  );
  const fluteTone = keep(new Tone.Filter({ frequency: 3500, type: 'lowpass' }));
  flute.chain(
    keep(new Tone.Vibrato({ frequency: 4.8, depth: 0.06 })),
    fluteTone,
    keep(new Tone.FeedbackDelay({ delayTime: '4n.', feedback: 0.18, wet: 0.12 })),
    keep(new Tone.Panner(0.15)),
    fluteFader,
  );
  breath.chain(keep(new Tone.Filter({ frequency: 2500, type: 'bandpass', Q: 0.8 })), fluteFader);

  // ---------- L5 guitar fills ----------
  const fillFader = fader(0.3);
  const fillBus = keep(new Tone.Volume(LEVELS.fills));
  fillBus.chain(
    keep(new Tone.Filter({ frequency: 3200, type: 'lowpass' })),
    keep(new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.2, wet: 0.18 })),
    keep(new Tone.Panner(0.3)),
    fillFader,
  );
  const fillStrings = strings(
    4,
    { attackNoise: 0.6, dampening: 4200, resonance: 0.93, release: 0.8 },
    fillBus,
  );

  // ---------- Recovery motif ----------
  let recoveryOn = false;
  const recoveryFader = fader(0.3);
  const recoveryVoice = keep(
    new Tone.FMSynth({
      harmonicity: 3.01,
      modulationIndex: 3,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.004, decay: 0.9, sustain: 0, release: 0.6 },
      modulationEnvelope: { attack: 0.002, decay: 0.15, sustain: 0, release: 0.2 },
      volume: LEVELS.recovery,
    }),
  );
  recoveryVoice.chain(keep(new Tone.Filter({ frequency: 3000, type: 'lowpass' })), recoveryFader);
  const recovery: Layer = {
    id: 6,
    name: 'Recovery',
    fader: recoveryFader,
    play: (time, bar, slot, slotSec) => {
      if (slot % 2 !== 0) return; // on the beat only
      const note = RECOVERY_MOTIF[bar % 2][slot / 2];
      if (!note) return;
      const v = 0.8;
      recoveryVoice.triggerAttackRelease(note, slotSec * 1.8, time, v);
      onNote?.(RECOVERY_LAYER, midiOf(note), time, slotSec * 1.8, v, recoveryOn);
    },
  };

  const layers: Layer[] = [
    {
      id: 1,
      name: LAYER_NAMES[0],
      fader: bongoFader,
      play: (time, _bar, slot, slotSec) => {
        const [drum, vel] = BONGO_PATTERN[slot];
        const v = vel * human();
        if (drum === 'h') bongoHigh.triggerAttackRelease('A4', '32n', time, v);
        else bongoLow.triggerAttackRelease('E4', '32n', time, v);
        shaker.triggerAttackRelease('32n', time, SHAKER_VEL[slot] * human());
        onNote?.(0, 0, time, slotSec * 0.3, v, audible[0]);
      },
    },
    {
      id: 2,
      name: LAYER_NAMES[1],
      fader: bassFader,
      play: (time, bar, slot, slotSec) =>
        playEvents(
          1,
          bassBar(chordForBar(bar), nextChord(bar)),
          slot,
          slotSec,
          time,
          (n, d, t, v) => bass.triggerAttackRelease(n, d, t, v),
        ),
    },
    {
      id: 3,
      name: LAYER_NAMES[2],
      fader: guitarFader,
      play: (time, bar, slot, slotSec) => {
        // Strum: the notes of a chord land a few milliseconds apart, low to high.
        let k = 0;
        playEvents(2, guitarBar(chordForBar(bar)), slot, slotSec, time, (n, _d, t, v) => {
          guitar(n, t + 0.018 * k, v);
          k++;
        });
      },
    },
    {
      id: 4,
      name: LAYER_NAMES[3],
      fader: fluteFader,
      play: (time, bar, slot, slotSec) =>
        playEvents(3, melodyBar(bar), slot, slotSec, time, (n, d, t, v) => {
          flute.triggerAttackRelease(n, d, t, v);
          breath.triggerAttackRelease(Math.min(d, 0.4), t, v * 0.6);
        }),
    },
    {
      id: 5,
      name: LAYER_NAMES[4],
      fader: fillFader,
      play: (time, bar, slot, slotSec) =>
        playEvents(4, fillBar(chordForBar(bar), bar), slot, slotSec, time, (n, _d, t, v) =>
          fillStrings(n, t, v),
        ),
    },
  ];

  return {
    playPulse(time, beatInBar) {
      kick.triggerAttackRelease('F2', '8n', time, beatInBar === 0 ? 1 : 0.85);
      tick.triggerAttackRelease('32n', time, beatInBar === 0 ? 1 : 0.55);
    },
    layers,
    recovery,
    setRecovery(on, time = Tone.now()) {
      recoveryOn = on;
      const g = recoveryFader.gain;
      g.cancelScheduledValues(time);
      g.setValueAtTime(g.getValueAtTime(time), time);
      // Gentle both ways: no sudden volume jumps.
      g.linearRampToValueAtTime(on ? 1 : 0, time + (on ? 0.4 : 2.0));
    },
    setLayer(index, on, time = Tone.now()) {
      audible[index] = on;
      const g = layers[index].fader.gain;
      g.cancelScheduledValues(time);
      g.setValueAtTime(g.getValueAtTime(time), time);
      g.linearRampToValueAtTime(on ? 1 : 0, time + (on ? FADE_IN_S : FADE_OUT_S));
    },
    dispose() {
      for (const n of nodes) n.dispose();
    },
  };
}
