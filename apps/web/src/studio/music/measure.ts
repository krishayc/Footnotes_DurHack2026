/**
 * Dev tool: render a few bars of each layer offline (faster than real time, no speakers) and
 * measure its loudness, so the mix can be balanced with numbers as well as ears.
 *   In the browser console on /studio (dev mode):  await __fn.measureMix()
 */
import * as Tone from 'tone';
import { createBand } from './band';

interface Level {
  part: string;
  rmsDb: number;
  peakDb: number;
}

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

async function render(which: 'pulse' | number | 'all', bars = 4, bpm = 100): Promise<Level> {
  const seconds = (bars * 4 * 60) / bpm + 2;
  const buffer = await Tone.Offline(async ({ transport, destination }) => {
    const band = createBand(destination);
    await Tone.loaded();
    transport.bpm.value = bpm;
    let beat = 0;
    let eighth = 0;
    if (which === 'all') band.layers.forEach((_, i) => band.setLayer(i, true, 0));
    else if (typeof which === 'number') band.setLayer(which, true, 0);
    transport.scheduleRepeat((t) => {
      if (which === 'pulse' || which === 'all') band.playPulse(t, beat % 4);
      beat++;
    }, '4n');
    transport.scheduleRepeat((t) => {
      const slot = eighth % 8;
      const bar = Math.floor(eighth / 8);
      eighth++;
      if (bar >= bars) return;
      for (const l of band.layers) l.play(t, bar, slot, 30 / bpm);
    }, '8n');
    transport.start(0);
  }, seconds);
  const data = buffer.toArray(0) as Float32Array;
  let sum = 0;
  let peak = 0;
  for (const v of data) {
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  const part = which === 'pulse' ? 'Pulse' : which === 'all' ? 'Everything' : `Layer ${which + 1}`;
  return {
    part,
    rmsDb: +db(Math.sqrt(sum / data.length)).toFixed(1),
    peakDb: +db(peak).toFixed(1),
  };
}

export async function measureMix() {
  const out: Level[] = [await render('pulse')];
  for (let i = 0; i < 5; i++) out.push(await render(i));
  out.push(await render('all'));
  return out;
}
