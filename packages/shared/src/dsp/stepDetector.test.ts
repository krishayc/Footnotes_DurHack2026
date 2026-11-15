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
  const { walk, steps, det } = run(
    { cadenceSpm: 100, seconds: 60, farLeg: 0.05, seed: 4 },
    { legMode: 'auto' },
  );
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

test('slow walking (60 spm, both legs felt) is NOT doubled by default', () => {
  const { walk, steps, det } = run({ cadenceSpm: 60, seconds: 60, farLeg: 0.6, seed: 8 });
  assert.ok(
    pct(steps.length, walk.stepTimes.length) <= 0.05,
    `${steps.length} vs ${walk.stepTimes.length}`,
  );
  assert.ok(pct(det.cadenceSpm!, 60) <= 0.05, `cadence ${det.cadenceSpm}`);
});

test('one-leg mode set from the start counts each bump as two steps', () => {
  const { walk, steps, det } = run(
    { cadenceSpm: 100, seconds: 60, farLeg: 0.05, seed: 9 },
    { legMode: 'one' },
  );
  assert.equal(det.oneLeg, true);
  assert.ok(
    pct(steps.length, walk.stepTimes.length) <= 0.08,
    `${steps.length} vs ${walk.stepTimes.length}`,
  );
});

test('far leg barely felt (20% of the pocket leg): still counts both feet', () => {
  for (const cadenceSpm of [60, 80, 105]) {
    const { walk, steps, det } = run({
      cadenceSpm,
      seconds: 60,
      farLeg: 0.2,
      jitter: 0.06,
      seed: 12,
    });
    assert.ok(
      pct(steps.length, walk.stepTimes.length) <= 0.05,
      `${cadenceSpm} spm: ${steps.length} vs ${walk.stepTimes.length}`,
    );
    assert.ok(pct(det.cadenceSpm!, cadenceSpm) <= 0.05, `cadence ${det.cadenceSpm}`);
    assert.ok(
      steps.every((s) => !s.inferred),
      'faint steps are real bumps, not guesses',
    );
  }
});

test('faint-foot search does not add steps to a normal walk', () => {
  const { walk, steps } = run({ cadenceSpm: 100, seconds: 60, farLeg: 0.8, seed: 13 });
  assert.ok(
    steps.length <= walk.stepTimes.length + 1,
    `${steps.length} vs ${walk.stepTimes.length}`,
  );
});
