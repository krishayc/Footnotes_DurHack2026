import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClockSync } from './clockSync';
import { mulberry32 } from './dsp/synthWalk';

/** Simulate exchanges over a jittery, sometimes lopsided network with a known true offset. */
function simulate(trueOffset: number, n: number, seed = 1) {
  const rand = mulberry32(seed);
  const sync = new ClockSync();
  let now = 1000;
  for (let i = 0; i < n; i++) {
    // Each direction: 10-30 ms base, plus occasional 100-300 ms spikes (WiFi hiccups).
    const leg = () => 10 + rand() * 20 + (rand() < 0.2 ? 100 + rand() * 200 : 0);
    const t0 = now;
    const there = leg();
    const back = leg();
    const t1 = t0 + there + trueOffset; // phone clock
    const t2 = t0 + there + back;
    sync.add(t0, t1, t2);
    now += 2000;
  }
  return sync;
}

test('recovers a large offset to within a few ms despite network spikes', () => {
  const trueOffset = -123456.7;
  const est = simulate(trueOffset, 30).current!;
  assert.ok(
    Math.abs(est.offset - trueOffset) < 8,
    `error ${(est.offset - trueOffset).toFixed(1)} ms`,
  );
  assert.ok(est.uncertainty < 30);
});

test('converts phone time to laptop time', () => {
  const sync = new ClockSync();
  sync.add(100, 5110, 120); // rtt 20, offset 5110 - 110 = 5000
  assert.equal(sync.toLocal(5500), 500);
});

test('ignores impossible samples', () => {
  const sync = new ClockSync();
  assert.equal(sync.add(100, 0, 50), null); // negative round trip
  assert.equal(sync.current, null);
});

test('notices when the phone clock restarts and re-estimates', () => {
  const sync = new ClockSync();
  for (let i = 0; i < 10; i++) sync.add(i * 1000, i * 1000 + 10 + 5000, i * 1000 + 20);
  assert.equal(sync.current!.offset, 5000);
  // Phone page reloaded: its clock now reads 70 s less.
  for (let i = 10; i < 13; i++) sync.add(i * 1000, i * 1000 + 10 - 65000, i * 1000 + 20);
  assert.equal(sync.current!.offset, -65000);
});

test('a single wild sample does not move the estimate', () => {
  const sync = new ClockSync();
  for (let i = 0; i < 10; i++) sync.add(i * 1000, i * 1000 + 10 + 5000, i * 1000 + 20);
  sync.add(20000, 20000 + 10 + 9000, 20000 + 20);
  assert.equal(sync.current!.offset, 5000);
});
