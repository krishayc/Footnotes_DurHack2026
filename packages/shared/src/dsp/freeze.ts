/**
 * Freezing-of-gait detection with the "freeze index" (Moore et al. 2008; used by Bächlin et
 * al. 2010 on the Daphnet dataset).
 *
 * The idea: when someone walks, most of the leg's movement energy is slow, in the
 * "locomotion band" (0.5 to 3 Hz: the step rhythm). During a freeze the legs often tremble
 * on the spot ("trembling in place"), which puts energy into the faster "freeze band"
 * (3 to 8 Hz). So:
 *
 *     freeze index (FI) = power in 3–8 Hz  /  power in 0.5–3 Hz
 *
 * A high FI means "more trembling than walking". Standing still also has little locomotion
 * power, so FI alone would flag standing; we also require enough total power (movement).
 *
 * Pipeline (one result every hop, 0.5 s):
 *   1. Resample the incoming signal to exactly 64 Hz (the Daphnet rate; phones are uneven).
 *   2. Take the last 4 s (256 samples), remove the mean, apply a Hann window.
 *   3. FFT, then sum the power in each band.
 *   4. Freezing if FI > fiThreshold AND total power > powerThreshold, held for a moment so
 *      the state doesn't flicker (enter after 1 hop over threshold, leave after 2 under).
 *
 * The same class runs in the offline Daphnet evaluation (scripts/daphnet.ts) and in the
 * Studio (replay and the experimental live phone watch), so the numbers in docs/ describe
 * exactly the code the demo runs.
 */

export const FREEZE_RATE_HZ = 64;
export const FREEZE_WINDOW = 256; // 4 s at 64 Hz
export const FREEZE_HOP = 32; // 0.5 s
export const LOCO_BAND: [number, number] = [0.5, 3];
export const FREEZE_BAND: [number, number] = [3, 8];

export interface FreezeThresholds {
  /** Freeze index above this (ratio) ... */
  fi: number;
  /** ... and total band power above this ((m/s²)², per our FFT scaling). */
  power: number;
}

export interface FreezeFrame {
  /** Time of the newest sample in the window (same clock as the input). */
  t: number;
  fi: number;
  locoPower: number;
  freezePower: number;
  totalPower: number;
  /** Raw decision for this window (before the hold). */
  over: boolean;
  /** Decision after the enter/leave hold. */
  freezing: boolean;
}

/** In-place radix-2 FFT. re/im lengths must be the same power of two. */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

const HANN = Float64Array.from(
  { length: FREEZE_WINDOW },
  (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FREEZE_WINDOW - 1)),
);

/** Band powers of one 256-sample window (64 Hz). */
export function bandPowers(window: ArrayLike<number>) {
  const n = FREEZE_WINDOW;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += window[i];
  mean /= n;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = (window[i] - mean) * HANN[i];
  fft(re, im);
  const df = FREEZE_RATE_HZ / n;
  let loco = 0;
  let frz = 0;
  for (let k = 1; k < n / 2; k++) {
    const f = k * df;
    const p = (re[k] * re[k] + im[k] * im[k]) / n;
    if (f >= LOCO_BAND[0] && f < LOCO_BAND[1]) loco += p;
    else if (f >= FREEZE_BAND[0] && f <= FREEZE_BAND[1]) frz += p;
  }
  return { locoPower: loco, freezePower: frz, totalPower: loco + frz, fi: frz / (loco + 1e-9) };
}

export class FreezeDetector {
  private buf = new Float64Array(FREEZE_WINDOW);
  private filled = 0;
  private sinceHop = 0;
  private nextT: number | null = null;
  private lastT = 0;
  private lastV = 0;
  private overRun = 0;
  private underRun = 0;
  private _freezing = false;

  constructor(
    public thresholds: FreezeThresholds,
    private readonly onFrame?: (f: FreezeFrame) => void,
    /** Hops over threshold to enter, and under to leave. */
    private readonly hold = { enter: 1, leave: 2 },
  ) {}

  get freezing() {
    return this._freezing;
  }

  reset() {
    this.filled = 0;
    this.sinceHop = 0;
    this.nextT = null;
    this.overRun = 0;
    this.underRun = 0;
    this._freezing = false;
  }

  /** Feed one sample (t in ms, any clock; value in m/s², e.g. acceleration magnitude). */
  push(t: number, v: number) {
    const step = 1000 / FREEZE_RATE_HZ;
    if (this.nextT === null) {
      this.nextT = t;
      this.lastT = t;
      this.lastV = v;
    }
    // A long gap (sensor paused): start the window again rather than invent data.
    if (t - this.lastT > 500) {
      this.reset();
      this.nextT = t;
      this.lastT = t;
      this.lastV = v;
    }
    // Linear interpolation onto the exact 64 Hz grid.
    while (this.nextT! <= t) {
      const span = t - this.lastT;
      const k = span > 0 ? (this.nextT! - this.lastT) / span : 1;
      this.addSample(this.nextT!, this.lastV + k * (v - this.lastV));
      this.nextT! += step;
    }
    this.lastT = t;
    this.lastV = v;
  }

  private addSample(t: number, v: number) {
    if (this.filled < FREEZE_WINDOW) this.buf[this.filled++] = v;
    else {
      this.buf.copyWithin(0, 1);
      this.buf[FREEZE_WINDOW - 1] = v;
    }
    if (this.filled < FREEZE_WINDOW) return;
    // First full window, then every hop (32 samples = 0.5 s).
    if (this.sinceHop % FREEZE_HOP === 0) this.frame(t);
    this.sinceHop++;
  }

  private frame(t: number) {
    const p = bandPowers(this.buf);
    const over = p.fi > this.thresholds.fi && p.totalPower > this.thresholds.power;
    if (over) {
      this.overRun++;
      this.underRun = 0;
      if (this.overRun >= this.hold.enter) this._freezing = true;
    } else {
      this.underRun++;
      this.overRun = 0;
      if (this.underRun >= this.hold.leave) this._freezing = false;
    }
    this.onFrame?.({ t, ...p, over, freezing: this._freezing });
  }
}
