import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StepDetector, type DetectedStep } from './stepDetector';
import { synthWalk, type SynthWalkOptions } from './synthWalk';

function run(opts: SynthWalkOptions, settings = {}) {
  const walk = synthWalk(opts);
  const steps: DetectedStep[] = [];
  const det = new StepDetector(settings, (s) => steps.push(s));
  for (const [t, x, y, z] of walk.samples) det.push(t, x, y, z);
  return { walk, steps, det };
}

const pct = (a: number, b: number) => Math.abs(a - b) / b;

test('both legs felt, 105 steps a minute: count within 5%', () => {
  const { walk, steps, det } = run({ cadenceSpm: 105, seconds: 60, seed: 2 });
  assert.ok(
    pct(steps.length, walk.stepTimes.length) <= 0.05,
    `${steps.length} vs ${walk.stepTimes.length}`,
  );
  assert.ok(pct(det.cadenceSpm!, 105) <= 0.04, `cadence ${det.cadenceSpm}`);
  assert.equal(det.oneLeg, false);
});

test('slow, irregular walking (80 spm, 8% jitter): count within 5%', () => {
  const { walk, steps } = run({ cadenceSpm: 80, seconds: 60, jitter: 0.08, farLeg: 0.5, seed: 3 });
  assert.ok(
    pct(steps.length, walk.stepTimes.length) <= 0.05,
    `${steps.length} vs ${walk.stepTimes.length}`,
  );
});

test('only the pocket leg felt: auto mode switches to strides and still counts every step', () => {
  const { walk, steps, det } = run({ cadenceSpm: 100, seconds: 60, farLeg: 0.05, seed: 4 });
  assert.equal(det.oneLeg, true);
  assert.ok(
    pct(steps.length, walk.stepTimes.length) <= 0.08,
    `${steps.length} vs ${walk.stepTimes.length}`,
  );
  assert.ok(pct(det.cadenceSpm!, 100) <= 0.05, `cadence ${det.cadenceSpm}`);
});

test('phone lying still: no steps', () => {
  const { steps } = run({ cadenceSpm: 100, seconds: 30, standStillS: 30, seed: 5 });
  assert.ok(steps.length <= 1, `${steps.length} phantom steps`);
});

test('step times land close to the true foot strikes (filter delay removed)', () => {
  const { walk, steps } = run({ cadenceSpm: 105, seconds: 40, seed: 6 });
  const errors: number[] = [];
  for (const s of steps) {
    let best = Infinity;
    for (const t of walk.stepTimes) if (Math.abs(s.t - t) < Math.abs(best)) best = s.t - t;
    errors.push(best);
  }
  const meanErr = errors.reduce((a, b) => a + b, 0) / errors.length;
  assert.ok(Math.abs(meanErr) < 40, `mean timing error ${meanErr.toFixed(1)} ms`);
});
