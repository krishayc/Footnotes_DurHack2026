/**
 * Replay a phone recording through the step detector and draw it.
 *
 *   npm run analyze -- recordings/walk-2026-11-14T19-30-00.json [--steps 40]
 *
 * Prints how many steps each leg setting would count and the pace it implies, and writes
 * <recording>.html: the smoothed signal, the threshold, and step markers, so you can see
 * exactly where steps were found (or doubled, or missed).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { StepDetector, median, type LegMode, type StepDetectorSettings } from '@footnotes/shared';

interface Recording {
  recordedAt: string;
  device: string;
  rateHz: number;
  settings: StepDetectorSettings;
  oneLegAtEnd: boolean;
  cadenceAtEnd: number | null;
  samples: [number, number, number, number][];
  steps: { t: number; inferred: boolean }[];
}

const args = process.argv.slice(2);
const file = args.find((a) => a.endsWith('.json'));
if (!file) {
  console.error(
    'Usage: npm run analyze -- recordings/<file>.json [--steps <how many you counted>]',
  );
  process.exit(1);
}
const counted = args.includes('--steps') ? Number(args[args.indexOf('--steps') + 1]) : null;
const rec = JSON.parse(readFileSync(file, 'utf8')) as Recording;
const t0 = rec.samples[0][0];
const seconds = (rec.samples[rec.samples.length - 1][0] - t0) / 1000;

function run(legMode: LegMode) {
  const steps: { t: number; inferred: boolean }[] = [];
  const frames: { t: number; f: number; thr: number }[] = [];
  const peaks: number[] = [];
  const det = new StepDetector({ ...rec.settings, legMode }, (s) => {
    steps.push({ t: s.t, inferred: s.inferred });
    if (!s.inferred) peaks.push(s.t);
  });
  for (const [t, x, y, z] of rec.samples) {
    const fr = det.push(t, x, y, z);
    frames.push({ t: fr.t, f: fr.filtered, thr: fr.threshold });
  }
  const gaps = peaks
    .slice(1)
    .map((t, i) => t - peaks[i])
    .filter((g) => g < 2500);
  return {
    steps,
    frames,
    peaks,
    medianGap: median(gaps),
    cadence: det.cadenceSpm,
    oneLeg: det.oneLeg,
    delay: det.filterDelayMs,
  };
}

const modes: LegMode[] = ['both', 'one', 'auto'];
const results = Object.fromEntries(modes.map((m) => [m, run(m)])) as Record<
  LegMode,
  ReturnType<typeof run>
>;

console.log(`\n${file}`);
console.log(
  `  ${seconds.toFixed(1)} s, ${rec.samples.length} samples (${(rec.samples.length / seconds).toFixed(0)} Hz), ${rec.device.slice(0, 60)}`,
);
console.log(
  `  On the phone: ${rec.steps.length} steps, pace ${rec.cadenceAtEnd?.toFixed(0) ?? '-'}, one-leg mode: ${rec.oneLegAtEnd}`,
);
console.log(
  `  Bumps found: ${results.both.peaks.length}, median gap between bumps ${results.both.medianGap.toFixed(0)} ms`,
);
for (const m of modes) {
  const r = results[m];
  console.log(
    `  ${m.padEnd(5)} -> ${String(r.steps.length).padStart(3)} steps, pace ${r.cadence?.toFixed(0) ?? '-'} steps/min${m === 'auto' ? ` (decided: ${r.oneLeg ? 'one leg' : 'both legs'})` : ''}`,
  );
}
if (counted) {
  for (const m of modes) {
    const r = results[m];
    console.log(
      `  ${m.padEnd(5)} vs your ${counted}: ${((r.steps.length / counted) * 100).toFixed(0)}%`,
    );
  }
}

// ---- Draw: one SVG row per 10 s. ----
const W = 1400;
const ROW_H = 220;
const rowMs = 10000;
const rows = Math.ceil((seconds * 1000) / rowMs);
const both = results.both;
let lo = Infinity;
let hi = -Infinity;
for (const fr of both.frames) {
  lo = Math.min(lo, fr.f);
  hi = Math.max(hi, fr.f, fr.thr);
}
const pad = (hi - lo) * 0.1;
lo -= pad;
hi += pad;
const parts: string[] = [];
for (let r = 0; r < rows; r++) {
  const start = t0 + r * rowMs;
  const y0 = r * (ROW_H + 30) + 20;
  const X = (t: number) => ((t - start) / rowMs) * W;
  const Y = (v: number) => y0 + (1 - (v - lo) / (hi - lo)) * ROW_H;
  parts.push(`<rect x="0" y="${y0}" width="${W}" height="${ROW_H}" fill="#13201C"/>`);
  for (let s = 0; s <= 10; s++)
    parts.push(
      `<line x1="${(s * W) / 10}" y1="${y0}" x2="${(s * W) / 10}" y2="${y0 + ROW_H}" stroke="#22332D"/><text x="${(s * W) / 10 + 3}" y="${y0 + 14}" fill="#6E9486" font-size="12">${r * 10 + s}s</text>`,
    );
  const inRow = both.frames.filter((f) => f.t >= start && f.t < start + rowMs);
  const shift = both.delay;
  parts.push(
    `<polyline fill="none" stroke="#B9C7C0" stroke-dasharray="5 5" stroke-width="1.5" points="${inRow.map((f) => `${X(f.t - shift).toFixed(1)},${Y(f.thr).toFixed(1)}`).join(' ')}"/>`,
  );
  parts.push(
    `<polyline fill="none" stroke="#F2B544" stroke-width="2" points="${inRow.map((f) => `${X(f.t - shift).toFixed(1)},${Y(f.f).toFixed(1)}`).join(' ')}"/>`,
  );
  for (const s of rec.steps.filter((s) => s.t >= start && s.t < start + rowMs)) {
    parts.push(
      `<circle cx="${X(s.t).toFixed(1)}" cy="${y0 + 30}" r="7" ${s.inferred ? 'fill="none" stroke="#7FD1A8" stroke-width="2"' : 'fill="#7FD1A8"'}/>`,
    );
  }
}
const html = `<!doctype html><meta charset="utf-8"><title>${file}</title>
<body style="background:#0F1916;color:#F1F3EE;font:16px system-ui;margin:20px">
<h2>${file}</h2>
<p>Gold: smoothed movement. Dashed: threshold. Green dots: steps the phone detected (hollow = inferred, i.e. the phone was counting one leg and filled in the other).</p>
<pre>${['both', 'one', 'auto'].map((m) => `${m}: ${results[m as LegMode].steps.length} steps, pace ${results[m as LegMode].cadence?.toFixed(0) ?? '-'}`).join('\n')}</pre>
<svg width="${W}" height="${rows * (ROW_H + 30) + 20}">${parts.join('')}</svg></body>`;
const out = file.replace(/\.json$/, '.html');
writeFileSync(out, html);
console.log(`  Graph: ${out}\n`);
