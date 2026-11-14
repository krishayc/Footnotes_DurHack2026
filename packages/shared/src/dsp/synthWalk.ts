/**
 * A synthetic pocket-phone walking signal with KNOWN step times.
 * Used by the detector tests and (Stage 4) the Simulated walker. Not real data: real walking is
 * messier, so the 40-step test on a real phone is still the test that matters.
 */

/** Small seeded random generator so tests are repeatable. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SynthWalkOptions {
  cadenceSpm: number;
  seconds: number;
  rateHz?: number;
  /** Step-to-step timing variability as a fraction (0.03 = 3%). */
  jitter?: number;
  /** Strength of the far leg's jolt relative to the pocket leg (1 = equal, ~0.1 = barely felt). */
  farLeg?: number;
  /** Sensor noise standard deviation, m/s². */
  noise?: number;
  /** Start walking after this many seconds of standing still. */
  standStillS?: number;
  seed?: number;
}

export interface SynthWalk {
  samples: [t: number, x: number, y: number, z: number][];
  stepTimes: number[];
}

export function synthWalk(o: SynthWalkOptions): SynthWalk {
  const rand = mulberry32(o.seed ?? 1);
  const gauss = () => {
    const u = 1 - rand();
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const rate = o.rateHz ?? 60;
  const jitter = o.jitter ?? 0.03;
  const farLeg = o.farLeg ?? 0.6;
  const noise = o.noise ?? 0.3;
  const start = (o.standStillS ?? 0) * 1000;
  const end = o.seconds * 1000;
  const stepMs = 60000 / o.cadenceSpm;

  const stepTimes: number[] = [];
  const amps: number[] = [];
  for (let t = start + stepMs / 2, i = 0; t < end - 200; i++) {
    stepTimes.push(t);
    amps.push((i % 2 === 0 ? 1 : farLeg) * (4.5 + gauss() * 0.5));
    t += stepMs * (1 + gauss() * jitter);
  }

  const samples: SynthWalk['samples'] = [];
  let k = 0;
  for (let t = 0; t < end; t += 1000 / rate + gauss() * 1.5) {
    // Heel strike: a sharp jolt, then a smaller rebound ~120 ms later.
    let jolt = 0;
    while (k < stepTimes.length && stepTimes[k] < t - 600) k++;
    for (let j = k; j < stepTimes.length && stepTimes[j] < t + 300; j++) {
      const d = (t - stepTimes[j]) / 1000;
      jolt += amps[j] * Math.exp(-0.5 * (d / 0.035) ** 2);
      jolt -= amps[j] * 0.35 * Math.exp(-0.5 * ((d - 0.12) / 0.05) ** 2);
    }
    const walking = t >= start ? 1 : 0;
    const sway = walking * 0.8 * Math.sin((2 * Math.PI * t) / (2 * stepMs));
    samples.push([
      t,
      1.8 + 0.3 * jolt + 0.5 * sway + gauss() * noise,
      9.3 + jolt + gauss() * noise,
      2.4 + 0.5 * jolt - 0.4 * sway + gauss() * noise,
    ]);
  }
  return { samples, stepTimes };
}
