/**
 * Records the walk in progress: one point every 2 s (in-step score, paused or not, layers).
 * Lives outside the screens so moving to "End your walk?" and back doesn't lose anything.
 */
import { steps } from '../sensor/steps';
import { walk } from '../sensor/link';
import { saveWalk, type Walk, type WalkPoint } from './history';

const TICK_MS = 2000;
const PAUSE_AFTER_MS = 3000;

let startedAt: number | null = null;
let startedIso = '';
let points: WalkPoint[] = [];
let timer: number | undefined;
let stepsAtStart = 0;

export function walkActive() {
  return startedAt !== null;
}

/** Whether the walker has stopped stepping (no steps for 3 s). */
export function isPaused(): boolean {
  const last = steps.getSnapshot().lastStepAt;
  return last === null || performance.now() - last > PAUSE_AFTER_MS;
}

export function startWalk() {
  if (startedAt !== null) return;
  startedAt = performance.now();
  startedIso = new Date().toISOString();
  points = [];
  stepsAtStart = steps.getSnapshot().count;
  timer = window.setInterval(() => {
    const st = walk.get().state;
    points.push({
      t: (performance.now() - startedAt!) / 1000,
      score: st?.score ?? 0,
      paused: isPaused(),
      layers: st?.layersOn.length ?? 0,
    });
  }, TICK_MS);
}

/** Seconds since the walk started (0 if none). */
export function walkSeconds() {
  return startedAt === null ? 0 : (performance.now() - startedAt) / 1000;
}

/** Stop recording and save. Returns the saved walk (null if it was too short to keep). */
export function finishWalk(): Walk | null {
  if (startedAt === null) return null;
  window.clearInterval(timer);
  const w: Walk = {
    id: startedIso,
    startedAt: startedIso,
    durationS: walkSeconds(),
    steps: Math.max(0, steps.getSnapshot().count - stepsAtStart),
    tempo: walk.get().state?.tempo ?? 0,
    points,
  };
  startedAt = null;
  if (w.durationS < 10) return null;
  saveWalk(w);
  return w;
}
