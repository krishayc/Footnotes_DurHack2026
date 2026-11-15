/**
 * The fixed musical material. Same key and chords throughout (principle 6): only which layers
 * play changes, never the harmony, so the music always sounds settled.
 *
 * Key: D major. Bright and open, and the pulse is already a D.
 * Loop (one chord per 4-beat bar):  Dmaj7 | Bm7 | Gmaj7 | A7sus4
 *   = the familiar I – vi – IV – V shape, softened with 7ths so it sounds warm, and the
 *     sus4 on the last bar leans gently back home to D instead of a bright, final-sounding V.
 *
 * Everything is written on an eighth-note grid: 8 slots per bar, slot 0 = beat 1.
 */

export interface Chord {
  name: string;
  /** Keys voicing (no root: the bass has it), close together in the middle register. */
  keys: string[];
  bassRoot: string;
  bassFifth: string;
  /** Chord tones for the high arpeggio. */
  sparkle: string[];
}

export const PROGRESSION: Chord[] = [
  {
    name: 'Dmaj7',
    keys: ['F#3', 'A3', 'C#4', 'E4'],
    bassRoot: 'D2',
    bassFifth: 'A2',
    sparkle: ['D5', 'F#5', 'A5', 'C#6'],
  },
  {
    name: 'Bm7',
    keys: ['F#3', 'A3', 'B3', 'D4'],
    bassRoot: 'B1',
    bassFifth: 'F#2',
    sparkle: ['B4', 'D5', 'F#5', 'A5'],
  },
  {
    name: 'Gmaj7',
    keys: ['F#3', 'G3', 'B3', 'D4'],
    bassRoot: 'G1',
    bassFifth: 'D2',
    sparkle: ['G4', 'B4', 'D5', 'F#5'],
  },
  {
    name: 'A7sus4',
    keys: ['E3', 'G3', 'A3', 'D4'],
    bassRoot: 'A1',
    bassFifth: 'E2',
    sparkle: ['A4', 'D5', 'E5', 'G5'],
  },
];

/** [slot, note, length in slots, velocity 0..1] */
export type NoteEvent = [slot: number, note: string, len: number, vel: number];

/** Bass: root on 1, a soft pickup, root on 3, fifth on 4. Steady, never busy. */
export function bassBar(chord: Chord): NoteEvent[] {
  return [
    [0, chord.bassRoot, 3, 1],
    [3, chord.bassRoot, 1, 0.55],
    [4, chord.bassRoot, 2, 0.85],
    [6, chord.bassFifth, 2, 0.7],
  ];
}

/** Keys: a held chord on beat 1 and a lighter one on beat 3. */
export function keysBar(chord: Chord): NoteEvent[] {
  return [
    ...chord.keys.map((n): NoteEvent => [0, n, 3.5, 0.8]),
    ...chord.keys.map((n): NoteEvent => [4, n, 3.5, 0.55]),
  ];
}

/**
 * Melody: a short, singable motif in D major pentatonic (D E F# A B), 4 bars long, with an
 * answering variation every other time round so it doesn't get stale.
 */
const MOTIF_A: NoteEvent[][] = [
  [
    [0, 'A4', 2, 0.9],
    [2, 'F#4', 1, 0.7],
    [3, 'A4', 1, 0.75],
    [4, 'B4', 3, 0.85],
  ],
  [
    [0, 'A4', 2, 0.85],
    [2, 'F#4', 2, 0.7],
    [4, 'D4', 3, 0.75],
  ],
  [
    [0, 'B4', 2, 0.85],
    [2, 'A4', 1, 0.7],
    [3, 'B4', 1, 0.75],
    [4, 'D5', 2, 0.9],
    [6, 'B4', 2, 0.7],
  ],
  [
    [0, 'A4', 3, 0.85],
    [3, 'G4', 1, 0.65],
    [4, 'E4', 2, 0.75],
    [6, 'D4', 2, 0.7],
  ],
];
const MOTIF_B: NoteEvent[][] = [
  MOTIF_A[0],
  MOTIF_A[1],
  [
    [0, 'D5', 2, 0.9],
    [2, 'B4', 2, 0.75],
    [4, 'A4', 2, 0.8],
    [6, 'F#4', 2, 0.7],
  ],
  [
    [0, 'E4', 4, 0.8],
    [4, 'A4', 4, 0.75],
  ],
];
export function melodyBar(bar: number): NoteEvent[] {
  const loop = Math.floor(bar / PROGRESSION.length);
  return (loop % 2 === 0 ? MOTIF_A : MOTIF_B)[bar % PROGRESSION.length];
}

/** Sparkle: a soft rising-and-falling arpeggio of chord tones on every eighth. */
export function sparkleBar(chord: Chord): NoteEvent[] {
  const order = [0, 1, 2, 3, 2, 1, 2, 1];
  return order.map((k, slot): NoteEvent => [slot, chord.sparkle[k], 1, slot % 2 ? 0.45 : 0.6]);
}

/** Shakers: eighths, leaning on the off-beats like a real shaker. */
export const SHAKER_VEL = [0.45, 0.85, 0.55, 0.95, 0.45, 0.85, 0.55, 0.95];

export const chordForBar = (bar: number) => PROGRESSION[bar % PROGRESSION.length];
