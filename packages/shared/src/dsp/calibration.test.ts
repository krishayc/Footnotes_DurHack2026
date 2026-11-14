import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibrate } from './calibration';
import { mulberry32 } from './synthWalk';

const steps = (spm: number, n: number, jitter = 0, seed = 1) => {
  const r = mulberry32(seed);
  const out: number[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    out.push(t);
    t += (60000 / spm) * (1 + (r() - 0.5) * 2 * jitter);
  }
  return out;
};

test('steady 96 spm walk gives 96 baseline and a +5% beat of 101', () => {
  const r = calibrate(steps(96, 32));
  assert.equal(Math.round(r.cadenceSpm!), 96);
  assert.equal(r.tempoBpm, 101);
  assert.equal(r.reliable, true);
});

test('a missed step and a hesitant start barely move the median', () => {
  const s = steps(100, 34);
  s.splice(15, 1); // detector missed one step
  const hesitant = [-4000, -2600, -1500, ...s]; // slow first steps get discarded
  const r = calibrate(hesitant);
  assert.ok(Math.abs(r.cadenceSpm! - 100) < 2, `${r.cadenceSpm}`);
});

test('very slow pace is clamped to 70 BPM and says so', () => {
  const r = calibrate(steps(55, 25));
  assert.equal(r.tempoBpm, 70);
  assert.equal(r.clamped, true);
  assert.ok(r.notes.length > 0);
});

test('too few steps is unreliable with a kind note', () => {
  const r = calibrate(steps(100, 6));
  assert.equal(r.reliable, false);
  assert.match(r.notes[0], /few steps/);
});

test('very irregular steps are flagged', () => {
  const r = calibrate(steps(100, 32, 0.6, 3));
  assert.equal(r.reliable, false);
});

test('offset is applied', () => {
  assert.equal(calibrate(steps(100, 32), 0.1).tempoBpm, 110);
  assert.equal(calibrate(steps(100, 32), 0).tempoBpm, 100);
});
