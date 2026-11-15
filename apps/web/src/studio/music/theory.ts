/**
 * The fixed musical material: an ORIGINAL gentle ballad in the spirit of early-60s pop (soft
 * Latin feel, nylon guitar, bongos, a tender tune). Same key and chords throughout
 * (principle 6): only which layers play changes, never the harmony.
 *
 * Key: F major. Warm and mellow.
 * Loop (one chord per 4-beat bar, 8 bars):
 *   Fmaj7 | Dm7 | Gm7 | C7 | Fmaj7 | F7 | Bbmaj7 | Bbm6
 *   = the classic I – vi – ii – V turnaround, then a lift to the IV chord and the tender
 *     "minor iv" (Bbm6) that sighs back home to F. Common 60s ballad moves; the tune on top is
 *     our own.
 *
 * Everything is written on an eighth-note grid: 8 slots per bar, slot 0 = beat 1.
 */

export interface Chord {
  name: string;
  /** Guitar voicing, low to high, in the middle register (the bass has the root). */
  guitar: string[];
  bassRoot: string;
  bassFifth: string;
  /** Notes for the little guitar fill that leads into the next bar (high to low). */
  fill: string[];
}

export const PROGRESSION: Chord[] = [
  {
    name: 'Fmaj7',
    guitar: ['F3', 'A3', 'C4', 'E4'],
    bassRoot: 'F2',
    bassFifth: 'C2',
    fill: ['E5', 'C5', 'A4'],
  },
  {
    name: 'Dm7',
    guitar: ['F3', 'A3', 'C4', 'D4'],
    bassRoot: 'D2',
    bassFifth: 'A1',
    fill: ['D5', 'C5', 'A4'],
  },
  {
    name: 'Gm7',
    guitar: ['F3', 'Bb3', 'D4', 'G4'],
    bassRoot: 'G1',
    bassFifth: 'D2',
    fill: ['D5', 'Bb4', 'G4'],
  },
  {
    name: 'C7',
    guitar: ['E3', 'G3', 'Bb3', 'C4'],
    bassRoot: 'C2',
    bassFifth: 'G1',
    fill: ['Bb4', 'G4', 'E4'],
  },
  {
    name: 'Fmaj7',
    guitar: ['F3', 'A3', 'C4', 'E4'],
    bassRoot: 'F2',
    bassFifth: 'C2',
    fill: ['C5', 'A4', 'F4'],
  },
  {
    name: 'F7',
    guitar: ['Eb3', 'F3', 'A3', 'C4'],
    bassRoot: 'F2',
    bassFifth: 'C2',
    fill: ['Eb5', 'C5', 'A4'],
  },
  {
    name: 'Bbmaj7',
    guitar: ['F3', 'A3', 'Bb3', 'D4'],
    bassRoot: 'Bb1',
    bassFifth: 'F2',
    fill: ['D5', 'Bb4', 'F4'],
  },
  {
    name: 'Bbm6',
    guitar: ['F3', 'G3', 'Bb3', 'Db4'],
    bassRoot: 'Bb1',
    bassFifth: 'F2',
    fill: ['Db5', 'Bb4', 'G4'],
  },
];

/** [slot, note, length in slots, velocity 0..1] */
export type NoteEvent = [slot: number, note: string, len: number, vel: number];

/**
 * Bass: a soft Latin-ballad line. Root on beat 1, the fifth on beat 3, and a little pickup
 * that walks into the next chord. Steady, never busy.
 */
export function bassBar(chord: Chord, next: Chord): NoteEvent[] {
  return [
    [0, chord.bassRoot, 3, 1],
    [3, chord.bassFifth, 1, 0.55],
    [4, chord.bassFifth, 3, 0.85],
    [7, next.bassFifth, 1, 0.5],
  ];
}

/**
 * Nylon guitar: fingerpicked comping in a gentle bossa-style rhythm. The chord is plucked
 * (strummed slightly, low to high) on beat 1, then answered off the beat.
 */
export function guitarBar(chord: Chord): NoteEvent[] {
  const pluck = (slot: number, len: number, vel: number) =>
    chord.guitar.map((n): NoteEvent => [slot, n, len, vel]);
  return [...pluck(0, 2.5, 0.8), ...pluck(3, 1.5, 0.5), ...pluck(5, 2.5, 0.6)];
}

/**
 * Melody (flute): an original, tender, mostly stepwise tune with long notes, 8 bars long.
 * Every other time round the last two bars change so it doesn't get stale.
 */
const TUNE_A: NoteEvent[][] = [
  [
    [0, 'A4', 3, 0.85],
    [3, 'C5', 1, 0.7],
    [4, 'E5', 4, 0.9],
  ],
  [
    [0, 'D5', 2, 0.85],
    [2, 'C5', 2, 0.7],
    [4, 'A4', 4, 0.8],
  ],
  [
    [0, 'Bb4', 3, 0.85],
    [3, 'A4', 1, 0.65],
    [4, 'G4', 2, 0.75],
    [6, 'D5', 2, 0.8],
  ],
  [
    [0, 'C5', 6, 0.85],
    [6, 'Bb4', 1, 0.6],
    [7, 'A4', 1, 0.6],
  ],
  [
    [0, 'A4', 2, 0.85],
    [2, 'G4', 1, 0.65],
    [3, 'A4', 1, 0.7],
    [4, 'C5', 4, 0.85],
  ],
  [
    [0, 'Eb5', 3, 0.9],
    [3, 'D5', 1, 0.7],
    [4, 'C5', 4, 0.8],
  ],
  [
    [0, 'D5', 3, 0.85],
    [3, 'C5', 1, 0.7],
    [4, 'Bb4', 2, 0.75],
    [6, 'A4', 2, 0.7],
  ],
  [
    [0, 'Db5', 4, 0.85],
    [4, 'C5', 4, 0.75],
  ],
];
const TUNE_B: NoteEvent[][] = [
  ...TUNE_A.slice(0, 6),
  [
    [0, 'F5', 3, 0.9],
    [3, 'D5', 1, 0.7],
    [4, 'Bb4', 4, 0.8],
  ],
  [
    [0, 'Bb4', 2, 0.75],
    [2, 'Db5', 2, 0.8],
    [4, 'C5', 2, 0.75],
    [6, 'A4', 2, 0.65],
  ],
];
export function melodyBar(bar: number): NoteEvent[] {
  const loop = Math.floor(bar / PROGRESSION.length);
  return (loop % 2 === 0 ? TUNE_A : TUNE_B)[bar % PROGRESSION.length];
}

/** Guitar fills: a soft three-note run in the gap at the end of the bar, leading onward. */
export function fillBar(chord: Chord, bar: number): NoteEvent[] {
  // Every bar except where the tune is still moving at the end of the bar.
  if (bar % 2 === 0)
    return [
      [5, chord.fill[0], 1, 0.5],
      [6, chord.fill[1], 1, 0.45],
      [7, chord.fill[2], 1, 0.45],
    ];
  return [
    [6, chord.fill[0], 1, 0.4],
    [7, chord.fill[2], 1, 0.4],
  ];
}

/**
 * Bongos (a soft Latin pattern on the eighths): 'h' = high drum, 'l' = low drum,
 * with velocity. The open low drum on beat 3 gives the gentle lilt.
 */
export const BONGO_PATTERN: ['h' | 'l', number][] = [
  ['h', 0.7],
  ['h', 0.35],
  ['h', 0.5],
  ['h', 0.35],
  ['l', 0.8],
  ['h', 0.35],
  ['h', 0.55],
  ['l', 0.45],
];
/** A light shaker under the bongos, leaning on the off-beats. */
export const SHAKER_VEL = [0.3, 0.6, 0.35, 0.65, 0.3, 0.6, 0.35, 0.65];

export const chordForBar = (bar: number) => PROGRESSION[bar % PROGRESSION.length];
export const nextChord = (bar: number) => PROGRESSION[(bar + 1) % PROGRESSION.length];
