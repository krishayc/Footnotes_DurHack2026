/**
 * The instruments. All synthesised with Tone.js (no sample files): fully offline, no licences,
 * nothing to download, and every sound shaped to be soft and warm. No harsh synth defaults:
 * each voice is filtered, enveloped and levelled by hand.
 *
 *   L0 Pulse    soft D thump + gentle tick          (always on, loudest timing reference)
 *   L1 Shakers  filtered noise on the eighths
 *   L2 Bass     round triangle bass, lightly saturated so laptop speakers can carry it
 *   L3 Keys     electric-piano style FM chords, light chorus
 *   L4 Melody   soft bell-like FM lead with a little echo
 *   L5 Sparkle  quiet high arpeggio with a ping-pong echo
 *   Recovery    a soft marimba-like motif ON the beat (D F# A F# | E G A -), used only
 *               while a freeze is detected: the same calm figure every time, so it is
 *               recognisable, and it marks every beat to help the next step start.
 *
 * Each layer goes through its own "fader" (a gain from 0 to 1). The arranger fades layers in
 * and out on bar lines; the notes themselves keep playing silently underneath, so a layer
 * always enters perfectly in step with the others.
 */
import * as Tone from 'tone';
import {
  SHAKER_VEL,
  bassBar,
  chordForBar,
  keysBar,
  melodyBar,
  sparkleBar,
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

export const LAYER_NAMES = ['Shakers', 'Bass', 'Keys', 'Melody', 'Sparkle'] as const;
const FADE_IN_S = 0.25;
const FADE_OUT_S = 1.0;

/** Mixer levels (dB), balanced by measuring each layer's loudness (see measureMix). */
export const LEVELS = {
  kick: -2,
  tick: -22,
  shakers: -7,
  bass: -17,
  keys: -9,
  melody: -5,
  sparkle: -17,
  recovery: -8,
};

/** The recovery motif: one note per beat, two bars (index = bar % 2, beat). null = rest. */
export const RECOVERY_MOTIF: (string | null)[][] = [
  ['D5', 'F#5', 'A5', 'F#5'],
  ['E5', 'G5', 'A5', null],
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

  // Shared reverb as a "send": wet layers feed a little of their signal into it.
  const reverb = keep(new Tone.Reverb({ decay: 2.8, preDelay: 0.02, wet: 1 })).connect(destination);
  const reverbSend = (amount: number) => keep(new Tone.Gain(amount)).connect(reverb);

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
      envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.02 },
      volume: LEVELS.tick,
    }),
  );
  tick.chain(keep(new Tone.Filter({ frequency: 2600, type: 'bandpass', Q: 1.2 })), destination);

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
      // Tiny velocity variation so repeated notes sound played, not stamped.
      const v = vel * (0.93 + Math.random() * 0.07);
      const dur = len * slotSec * 0.95;
      trigger(note, dur, time, v);
      onNote?.(layer, midiOf(note), time, dur, v, audible[layer]);
    }
  };

  // ---------- L1 shakers ----------
  const shakerFader = fader(0.05);
  const shaker = keep(
    new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.004, decay: 0.055, sustain: 0, release: 0.03 },
      volume: LEVELS.shakers,
    }),
  );
  shaker.chain(
    keep(new Tone.Filter({ frequency: 5500, type: 'highpass' })),
    keep(new Tone.Filter({ frequency: 9000, type: 'lowpass' })),
    keep(new Tone.Panner(0.25)),
    shakerFader,
  );

  // ---------- L2 bass ----------
  const bassFader = fader(0);
  const bass = keep(
    new Tone.MonoSynth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.25 },
      filter: { type: 'lowpass', Q: 1, rolloff: -24 },
      filterEnvelope: {
        attack: 0.005,
        decay: 0.25,
        sustain: 0.45,
        release: 0.4,
        baseFrequency: 140,
        octaves: 2.4,
      },
      volume: LEVELS.bass,
    }),
  );
  // Gentle saturation adds overtones so the bass line is audible on small speakers.
  const bassDrive = keep(new Tone.Chebyshev({ order: 2, wet: 0.25 }));
  bass.chain(bassDrive, keep(new Tone.Filter({ frequency: 1400, type: 'lowpass' })), bassFader);

  // ---------- L3 keys ----------
  const keysFader = fader(0.3);
  const keys = keep(
    new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 1,
      modulationIndex: 2.5,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.005, decay: 1.4, sustain: 0.25, release: 1.2 },
      modulationEnvelope: { attack: 0.002, decay: 0.45, sustain: 0.1, release: 0.6 },
      volume: LEVELS.keys,
    }),
  );
  keys.maxPolyphony = 16;
  keys.chain(
    keep(new Tone.Chorus({ frequency: 1.2, delayTime: 3, depth: 0.35, wet: 0.35 }).start()),
    keep(new Tone.Filter({ frequency: 3800, type: 'lowpass' })),
    keep(new Tone.Panner(-0.15)),
    keysFader,
  );

  // ---------- L4 melody ----------
  const melodyFader = fader(0.25);
  const melody = keep(
    new Tone.FMSynth({
      harmonicity: 2,
      modulationIndex: 1.5,
      oscillator: { type: 'sine' },
      modulation: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.7, sustain: 0.3, release: 0.9 },
      modulationEnvelope: { attack: 0.01, decay: 0.25, sustain: 0.15, release: 0.5 },
      volume: LEVELS.melody,
    }),
  );
  melody.chain(
    keep(new Tone.FeedbackDelay({ delayTime: '4n.', feedback: 0.2, wet: 0.15 })),
    keep(new Tone.Panner(0.1)),
    melodyFader,
  );

  // ---------- L5 sparkle ----------
  const sparkleFader = fader(0.35);
  const sparkle = keep(
    new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0, release: 0.3 },
      volume: LEVELS.sparkle,
    }),
  );
  sparkle.chain(
    keep(new Tone.PingPongDelay({ delayTime: '8n.', feedback: 0.3, wet: 0.3 })),
    keep(new Tone.Filter({ frequency: 500, type: 'highpass' })),
    sparkleFader,
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
      fader: shakerFader,
      play: (time, _bar, slot, slotSec) => {
        const v = SHAKER_VEL[slot] * (0.9 + Math.random() * 0.1);
        shaker.triggerAttackRelease('32n', time, v);
        onNote?.(0, 0, time, slotSec * 0.3, v, audible[0]);
      },
    },
    {
      id: 2,
      name: LAYER_NAMES[1],
      fader: bassFader,
      play: (time, bar, slot, slotSec) =>
        playEvents(1, bassBar(chordForBar(bar)), slot, slotSec, time, (n, d, t, v) =>
          bass.triggerAttackRelease(n, d, t, v),
        ),
    },
    {
      id: 3,
      name: LAYER_NAMES[2],
      fader: keysFader,
      play: (time, bar, slot, slotSec) =>
        playEvents(2, keysBar(chordForBar(bar)), slot, slotSec, time, (n, d, t, v) =>
          keys.triggerAttackRelease(n, d, t, v),
        ),
    },
    {
      id: 4,
      name: LAYER_NAMES[3],
      fader: melodyFader,
      play: (time, bar, slot, slotSec) =>
        playEvents(3, melodyBar(bar), slot, slotSec, time, (n, d, t, v) =>
          melody.triggerAttackRelease(n, d, t, v),
        ),
    },
    {
      id: 5,
      name: LAYER_NAMES[4],
      fader: sparkleFader,
      play: (time, bar, slot, slotSec) =>
        playEvents(4, sparkleBar(chordForBar(bar)), slot, slotSec, time, (n, d, t, v) =>
          sparkle.triggerAttackRelease(n, d, t, v),
        ),
    },
  ];

  return {
    playPulse(time, beatInBar) {
      kick.triggerAttackRelease('D2', '8n', time, beatInBar === 0 ? 1 : 0.85);
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
