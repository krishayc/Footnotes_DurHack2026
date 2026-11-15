/**
 * Bridge between the Studio and the phone's patient app.
 *  - Sends the walk state (phase, pace, beat, score, layers) to the phone on every change,
 *    at most 4 times a second, and once a second regardless.
 *  - Carries out the phone's commands (find my pace, start/stop the beat, a bit faster...).
 * The beat time is converted into the phone's clock with the clock-sync offset, so the
 * phone's pulsing circle lands exactly on the beat the laptop plays.
 */
import { LAYER_UP, type WalkStateMsg } from '@footnotes/shared';
import { CALIBRATION_MS, FALLBACK_TEMPO } from '@footnotes/shared';
import { audio } from './audio/engine';
import { LAYER_NAMES } from './music/band';
import { arranger } from './music/arranger';
import { session } from './session';
import type { StudioLink } from './link';
import { sync } from './sync';
import { stepBus } from './steps';

export function startWalkBridge(link: StudioLink) {
  let lastSent = 0;
  let pending: number | undefined;

  const build = (): Omit<WalkStateMsg, 'type'> => {
    const s = session.state.get();
    const a = audio.state.get();
    const arr = arranger.state.get();
    const lastBeat = audio.beats[audio.beats.length - 1];
    const off = link.clock.current?.offset;
    const nextIdx = arr.on.findIndex((v) => !v);
    return {
      phase: a.playing ? 'walking' : s.phase,
      audioOn: a.status === 'on',
      calLeftMs:
        s.phase === 'calibrating' && s.calStartedAt !== null
          ? Math.max(0, CALIBRATION_MS - (performance.now() - s.calStartedAt))
          : null,
      calSteps: s.calStepCount,
      calNotes: s.result?.notes ?? [],
      baseline: s.baseline,
      tempo: s.tempo,
      offset: s.offset,
      score: a.playing ? sync.state.get().score : 0,
      layersOn: a.playing ? LAYER_NAMES.filter((_, i) => arr.on[i]) : [],
      nextLayer: a.playing && nextIdx >= 0 ? LAYER_NAMES[nextIdx] : null,
      beatPhoneT: a.playing && lastBeat && off !== undefined ? lastBeat.t + off : null,
      periodMs: audio.periodMs,
      freezing: a.playing && arr.recovering,
    };
  };

  const send = () => {
    pending = undefined;
    lastSent = performance.now();
    link.conn.send({ type: 'walkState', ...build() });
  };
  /** Send soon, but not more than 4 times a second. */
  const schedule = () => {
    if (pending !== undefined) return;
    pending = window.setTimeout(send, Math.max(0, 250 - (performance.now() - lastSent)));
  };

  const unsubs = [
    session.state.subscribe(schedule),
    audio.state.subscribe(schedule),
    arranger.state.subscribe(schedule),
    link.conn.subscribe(schedule),
    link.conn.onMessage((msg) => {
      if (msg.type === 'peer' && msg.connected) schedule();
      if (msg.type !== 'walkCommand') return;
      switch (msg.action) {
        case 'calibrate':
          stepBus.setMode('live'); // the phone is driving: use its steps
          session.startCalibration();
          break;
        case 'cancelCalibration':
          session.cancelCalibration();
          break;
        case 'startBeat':
          if (session.state.get().phase !== 'ready') session.useFixedTempo(FALLBACK_TEMPO);
          if (!audio.state.get().playing) session.startBeat();
          break;
        case 'stopBeat':
          session.stopBeat();
          break;
        case 'nudge':
          session.nudgeTempo(msg.value ?? 0);
          break;
        case 'setOffset':
          if (typeof msg.value === 'number') session.setOffset(msg.value);
          break;
      }
      schedule();
    }),
  ];
  const heartbeat = window.setInterval(send, 1000);

  return () => {
    unsubs.forEach((u) => u());
    window.clearInterval(heartbeat);
    window.clearTimeout(pending);
  };
}

/** For the Studio: plain words for what the next layer needs. */
export const nextLayerHint = (i: number) =>
  `${LAYER_NAMES[i]} at ${Math.round(LAYER_UP[i] * 100)}%`;
