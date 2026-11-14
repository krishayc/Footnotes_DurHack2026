/**
 * Calibration: turn ~20 s of natural walking into a baseline pace and a beat tempo.
 *
 *  - The first few steps are thrown away: starting to walk is the least representative part
 *    (and, for people with Parkinson's, often the hesitant part).
 *  - Baseline pace = 60000 / median gap between steps. The median ignores the odd missed or
 *    doubled step, unlike an average.
 *  - Tempo = baseline × (1 + offset). Default offset +5% (adjustable 0 to +15%): a beat just
 *    above natural pace, as in Rhythmic Auditory Stimulation. Studies use a range of offsets;
 *    there is no single proven best value (see README, "to verify").
 *  - Tempo is clamped to 70 to 130 BPM so a strange reading can never produce a silly beat.
 *  - We flag the result as unreliable (with a kind, specific reason) if there were too few
 *    steps or the timing was very irregular, so the Studio can suggest trying again.
 */
import { median } from './stats';

export const TEMPO_MIN = 70;
export const TEMPO_MAX = 130;
export const DEFAULT_OFFSET = 0.05;
export const OFFSET_MIN = 0;
export const OFFSET_MAX = 0.15;
export const CALIBRATION_MS = 20_000;
export const DISCARD_FIRST_STEPS = 3;
const MIN_STEPS = 10;
/** Coefficient of variation of step gaps above which timing counts as "very irregular". */
const MAX_IRREGULARITY = 0.25;

export interface CalibrationResult {
  /** Baseline pace, steps per minute (null if not enough steps). */
  cadenceSpm: number | null;
  /** Beat tempo, BPM (clamped). Falls back to 100 if no pace could be measured. */
  tempoBpm: number;
  stepsUsed: number;
  /** Step-to-step variability: std / mean of the gaps (0 = metronomic). */
  irregularity: number | null;
  reliable: boolean;
  /** Plain-English reasons if not reliable. */
  notes: string[];
  clamped: boolean;
}

export function tempoFromCadence(cadenceSpm: number, offset: number) {
  const raw = cadenceSpm * (1 + offset);
  const tempo = Math.round(Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, raw)));
  return { tempo, clamped: tempo !== Math.round(raw) };
}

/** stepTimes in ms (any clock), in order. */
export function calibrate(
  stepTimes: readonly number[],
  offset = DEFAULT_OFFSET,
): CalibrationResult {
  const used = stepTimes.slice(DISCARD_FIRST_STEPS);
  const gaps: number[] = [];
  for (let i = 1; i < used.length; i++) {
    const g = used[i] - used[i - 1];
    if (g > 0 && g < 2500) gaps.push(g); // ignore pauses longer than 2.5 s
  }
  const notes: string[] = [];

  if (gaps.length < MIN_STEPS - 1) {
    notes.push('We only felt a few steps. Try walking for the whole 20 seconds.');
    return {
      cadenceSpm: gaps.length >= 3 ? 60000 / median(gaps) : null,
      tempoBpm: 100,
      stepsUsed: used.length,
      irregularity: null,
      reliable: false,
      notes,
      clamped: false,
    };
  }

  const cadenceSpm = 60000 / median(gaps);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
  const irregularity = sd / mean;
  if (irregularity > MAX_IRREGULARITY) {
    notes.push('The steps were quite uneven, so this pace is a rough guess.');
  }
  const { tempo, clamped } = tempoFromCadence(cadenceSpm, offset);
  if (clamped) notes.push(`The beat was kept within ${TEMPO_MIN} to ${TEMPO_MAX} beats a minute.`);

  return {
    cadenceSpm,
    tempoBpm: tempo,
    stepsUsed: used.length,
    irregularity,
    reliable: irregularity <= MAX_IRREGULARITY,
    notes,
    clamped,
  };
}
