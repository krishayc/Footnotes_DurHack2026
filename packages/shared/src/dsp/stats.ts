/** Small maths helpers shared by the phone, the studio and the Daphnet scripts. */

/** Median of a list (returns NaN for an empty list). Robust to the odd outlier. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Smoothing factor for a one-pole low-pass filter / exponential moving average,
 * given the time since the last sample (dt) and a time constant (tau), both in seconds.
 * Using dt (not a fixed sample rate) keeps the filter correct when phones deliver samples
 * unevenly, which they do.
 */
export function alphaFromTau(dt: number, tau: number): number {
  return 1 - Math.exp(-dt / tau);
}

/** Time constant (s) of a one-pole low-pass filter with cutoff frequency fc (Hz). */
export function tauFromCutoff(fc: number): number {
  return 1 / (2 * Math.PI * fc);
}
