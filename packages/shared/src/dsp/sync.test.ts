import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SyncScorer, circularStats, phaseAgainstBeats, syncStats } from './sync';
import { mulberry32 } from './synthWalk';

const PERIOD = 600; // 100 BPM
const beats = Array.from({ length: 200 }, (_, i) => ({ t: 1000 + i * PERIOD }));

test('phase: on the beat, early, late, and wrap-around', () => {
  assert.equal(phaseAgainstBeats(1000 + 5 * PERIOD, beats, PERIOD)!.phase, 0);
  assert.ok(Math.abs(phaseAgainstBeats(1000 + 5 * PERIOD - 60, beats, PERIOD)!.phase + 0.1) < 1e-9);
  assert.ok(
    Math.abs(phaseAgainstBeats(1000 + 5 * PERIOD + 120, beats, PERIOD)!.phase - 0.2) < 1e-9,
  );
  // 0.6 of a beat after a beat = 0.4 before the next one.
  assert.ok(
    Math.abs(phaseAgainstBeats(1000 + 5 * PERIOD + 360, beats, PERIOD)!.phase + 0.4) < 1e-9,
  );
});

test('phase: extrapolates past the end of the beat log', () => {
  const last = beats[beats.length - 1].t;
  assert.ok(
    Math.abs(phaseAgainstBeats(last + 3 * PERIOD + 30, beats, PERIOD)!.phase - 0.05) < 1e-9,
  );
});

test('circular mean handles wrap-around (+0.49 and −0.49 are close)', () => {
  const { R, meanPhase } = circularStats([0.49, -0.49]);
  assert.ok(R > 0.99);
  assert.ok(Math.abs(Math.abs(meanPhase) - 0.5) < 0.01);
});

function walk(opts: {
  spm: number;
  jitter: number;
  lockLag?: number;
  locked: boolean;
  n: number;
  seed: number;
}) {
  const r = mulberry32(opts.seed);
  const g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const scorer = new SyncScorer();
  const tempo = 60000 / PERIOD;
  let t = 1000 + 3 * PERIOD;
  for (let i = 0; i < opts.n; i++) {
    const step = opts.locked
      ? 1000 + (3 + i) * PERIOD + (opts.lockLag ?? 0) * PERIOD + g() * opts.jitter * PERIOD
      : t;
    const p = phaseAgainstBeats(step, beats, PERIOD)!;
    scorer.push({ t: step, phase: p.phase, offsetMs: p.offsetMs, inferred: false }, tempo);
    t += (60000 / opts.spm) * (1 + g() * opts.jitter);
  }
  return scorer;
}

test('walking in time scores high', () => {
  const s = walk({ spm: 100, jitter: 0.03, locked: true, n: 30, seed: 1 });
  assert.ok(s.stats!.R > 0.95, `R ${s.stats!.R}`);
  assert.ok(s.score > 0.85, `score ${s.score}`);
});

test('consistently a little late still counts as locked in', () => {
  const s = walk({ spm: 100, jitter: 0.03, locked: true, lockLag: 0.1, n: 30, seed: 2 });
  assert.ok(Math.abs(s.stats!.meanPhase - 0.1) < 0.03);
  assert.ok(s.score > 0.75, `score ${s.score}`);
});

test('ignoring the beat (own pace 6% slower) scores low', () => {
  const s = walk({ spm: 94, jitter: 0.03, locked: false, n: 30, seed: 3 });
  assert.ok(s.score < 0.5, `score ${s.score}`);
});

test('random timing scores low', () => {
  const r = mulberry32(4);
  const phases = Array.from({ length: 10 }, () => r() - 0.5);
  const times = Array.from({ length: 10 }, (_, i) => i * PERIOD);
  assert.ok(syncStats(phases, times, 100)!.raw < 0.5);
});

test('score is smoothed: one wild step barely moves it', () => {
  const s = walk({ spm: 100, jitter: 0.02, locked: true, n: 30, seed: 5 });
  const before = s.score;
  const t = 1000 + 40 * PERIOD + 0.45 * PERIOD;
  s.push({ t, phase: 0.45, offsetMs: 0.45 * PERIOD, inferred: false }, 100);
  assert.ok(before - s.score < 0.1, `${before} -> ${s.score}`);
});

test('score fades when steps stop', () => {
  const s = walk({ spm: 100, jitter: 0.02, locked: true, n: 30, seed: 6 });
  const last = s.steps[s.steps.length - 1].t;
  const before = s.score;
  for (let t = last + 250; t < last + 6500; t += 250) s.tick(t, 250);
  assert.ok(s.score < before * 0.3, `${before} -> ${s.score}`);
});
