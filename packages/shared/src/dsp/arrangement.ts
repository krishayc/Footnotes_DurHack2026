/**
 * Which music layers should play, given the sync score.
 *
 * Layers on top of the always-on pulse (L0):  1 Bongos, 2 Bass, 3 Guitar, 4 Flute, 5 Guitar fills.
 *
 * HYSTERESIS: a layer comes IN at a higher score than the one at which it goes OUT. If the
 * score hovers around one threshold (say 0.45), the layer doesn't flicker on and off every
 * bar; it needs a clear rise to enter and a clear fall to leave.
 *
 * PACING (decided once per bar, so changes land on bar lines):
 *  - building up: at most ONE new layer per bar, so the music blooms gradually;
 *  - stripping back: up to TWO layers per bar, so a struggling walker quickly gets a
 *    clearer, simpler beat (principle 3: struggling = simpler, not louder).
 */
export const LAYER_COUNT = 5;
/** Score needed to ADD layer k+1 (index k). */
export const LAYER_UP = [0.3, 0.45, 0.6, 0.75, 0.88] as const;
/** Score below which layer k+1 (index k) is REMOVED. Always lower than LAYER_UP. */
export const LAYER_DOWN = [0.2, 0.35, 0.5, 0.65, 0.8] as const;

/** Where the arrangement wants to be for this score, starting from the current level. */
export function targetLevel(score: number, current: number): number {
  let level = Math.max(0, Math.min(LAYER_COUNT, current));
  while (level < LAYER_COUNT && score >= LAYER_UP[level]) level++;
  while (level > 0 && score < LAYER_DOWN[level - 1]) level--;
  return level;
}

/** One bar's move toward the target: up by 1, down by up to 2. */
export function stepLevel(current: number, target: number): number {
  if (target > current) return current + 1;
  if (target < current) return Math.max(target, current - 2);
  return current;
}
