import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYER_DOWN, LAYER_UP, stepLevel, targetLevel } from './arrangement';

test('every remove threshold is below its add threshold', () => {
  LAYER_UP.forEach((up, i) => assert.ok(LAYER_DOWN[i] < up));
});

test('no flicker when the score hovers around a threshold', () => {
  let level = 2; // Shakers + Bass playing
  const seen = new Set<number>();
  for (const score of [0.44, 0.46, 0.43, 0.47, 0.44, 0.46]) {
    level = stepLevel(level, targetLevel(score, level));
    seen.add(level);
  }
  assert.deepEqual([...seen], [2]);
});

test('builds one layer per bar from nothing to everything', () => {
  let level = 0;
  const path = [];
  for (let bar = 0; bar < 7; bar++) {
    level = stepLevel(level, targetLevel(0.95, level));
    path.push(level);
  }
  assert.deepEqual(path, [1, 2, 3, 4, 5, 5, 5]);
});

test('strips back two layers per bar when struggling', () => {
  let level = 5;
  const path = [];
  for (let bar = 0; bar < 4; bar++) {
    level = stepLevel(level, targetLevel(0.1, level));
    path.push(level);
  }
  assert.deepEqual(path, [3, 1, 0, 0]);
});

test('a middling score settles in the middle', () => {
  let level = 0;
  for (let bar = 0; bar < 10; bar++) level = stepLevel(level, targetLevel(0.62, level));
  assert.equal(level, 3);
});
