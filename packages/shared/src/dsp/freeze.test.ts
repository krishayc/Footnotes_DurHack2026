import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FreezeDetector, bandPowers, fft, type FreezeFrame } from './freeze';

test('FFT finds a pure tone in the right bin', () => {
  const n = 64;
  const re = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 5 * i) / n));
  const im = new Float64Array(n);
  fft(re, im);
  const mags = Array.from(re, (r, k) => Math.hypot(r, im[k]));
  assert.ok(Math.abs(mags[5] - n / 2) < 1e-6);
  assert.ok(mags[3] < 1e-6);
});

const tone = (hz: number, amp: number) =>
  Array.from({ length: 256 }, (_, i) => 9.8 + amp * Math.sin((2 * Math.PI * hz * i) / 64));

test('walking rhythm (1.8 Hz) gives a low freeze index, trembling (5 Hz) a high one', () => {
  assert.ok(bandPowers(tone(1.8, 3)).fi < 0.1);
  assert.ok(bandPowers(tone(5.5, 1)).fi > 10);
});

test('detector: walk, then tremble, then walk again', () => {
  const frames: FreezeFrame[] = [];
  const det = new FreezeDetector({ fi: 1.5, power: 0.5 }, (f) => frames.push(f));
  const seg = (fromS: number, toS: number, hz: number, amp: number) => {
    for (let t = fromS * 1000; t < toS * 1000; t += 1000 / 60)
      det.push(t, 9.8 + amp * Math.sin((2 * Math.PI * hz * t) / 1000));
  };
  seg(0, 10, 1.8, 3);
  seg(10, 18, 5.5, 1.5);
  seg(18, 30, 1.8, 3);
  const at = (s: number) => frames.find((f) => f.t >= s * 1000)!.freezing;
  assert.equal(at(9), false);
  assert.equal(at(16), true);
  assert.equal(at(27), false);
  // About two frames a second.
  assert.ok(Math.abs(frames.length - (30 - 4) * 2) <= 2, `${frames.length} frames`);
});

test('standing still is not a freeze (too little movement)', () => {
  const frames: FreezeFrame[] = [];
  const det = new FreezeDetector({ fi: 1.5, power: 0.5 }, (f) => frames.push(f));
  for (let t = 0; t < 20000; t += 16) det.push(t, 9.8 + 0.02 * Math.sin(t * 0.04));
  assert.ok(frames.every((f) => !f.freezing));
});
