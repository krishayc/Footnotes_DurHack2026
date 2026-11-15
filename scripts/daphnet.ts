/**
 * Daphnet Freezing of Gait: evaluate our freeze detector.
 *
 *   npm run daphnet
 *
 * Needs the dataset unzipped in scripts/daphnet/raw/dataset_fog_release/ (see
 * docs/daphnet-evaluation.md for where to download it). Writes:
 *   docs/daphnet-results.json                         every number
 *   docs/daphnet-evaluation.md                        the write-up (generated)
 *   packages/shared/src/dsp/freezeThresholds.ts       thresholds the app uses
 *
 * Method
 *  - Files: one per subject run, 64 Hz, 3 sensors × 3 axes in mg, plus an annotation column
 *    (0 = not part of the experiment, 1 = no freeze, 2 = freeze). Rows with 0 are dropped;
 *    each unbroken stretch of experiment is processed on its own ("segment").
 *  - Signal: acceleration MAGNITUDE (works whatever way a sensor or phone is turned, as a
 *    phone in a pocket would need), in m/s². Also the ankle's vertical axis alone, which is
 *    what the original papers used, for comparison.
 *  - Detector: packages/shared/src/dsp/freeze.ts, exactly as the app runs it.
 *  - Scores:
 *      window level: sensitivity (freeze windows flagged) and specificity (other windows not
 *        flagged), each window labelled by the annotation at its newest sample;
 *      event level: a freeze episode counts as detected if we flag it between 2 s before its
 *        start and 1 s after its end; latency = first flag − annotated start;
 *      false alarms: flagged stretches that don't overlap any freeze (±2 s), per hour.
 *  - Thresholds (FI and power) chosen on a grid to maximise √(sensitivity × specificity).
 *    Choosing them on the same data we score is optimistic, so we also report
 *    leave-one-subject-out: for each patient, thresholds are chosen on the other nine.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FreezeDetector,
  FREEZE_HOP,
  FREEZE_RATE_HZ,
  FREEZE_WINDOW,
  median,
  type FreezeThresholds,
} from '../packages/shared/src';

const root = resolve(import.meta.dirname, '..');
const dataDir = resolve(root, 'scripts/daphnet/raw/dataset_fog_release/dataset');
const MG = 9.80665 / 1000;

if (!existsSync(dataDir)) {
  console.error(`Dataset not found in ${dataDir}`);
  console.error(
    'Download https://archive.ics.uci.edu/static/public/245/daphnet+freezing+of+gait.zip and unzip it into scripts/daphnet/raw/',
  );
  process.exit(1);
}

// ------------------------------------------------------------------ load
interface Segment {
  subject: number;
  run: number;
  t: number[]; // ms
  cols: number[][]; // 9 sensor columns, m/s²
  label: number[]; // 1 or 2
}

const segments: Segment[] = [];
for (const file of readdirSync(dataDir).sort()) {
  const m = file.match(/^S(\d+)R(\d+)\.txt$/);
  if (!m) continue;
  const rows = readFileSync(resolve(dataDir, file), 'utf8').trim().split('\n');
  let cur: Segment | null = null;
  let lastT = -Infinity;
  for (const line of rows) {
    const v = line.trim().split(/\s+/).map(Number);
    if (v.length < 11) continue;
    const ann = v[10];
    if (ann === 0 || v[0] - lastT > 100) {
      if (cur && cur.t.length) segments.push(cur);
      cur = null;
    }
    lastT = v[0];
    if (ann === 0) continue;
    cur ??= {
      subject: +m[1],
      run: +m[2],
      t: [],
      cols: Array.from({ length: 9 }, () => []),
      label: [],
    };
    cur.t.push(v[0]);
    for (let c = 0; c < 9; c++) cur.cols[c].push(v[1 + c] * MG);
    cur.label.push(ann);
  }
  if (cur && cur.t.length) segments.push(cur);
}

const mag = (s: Segment, c0: number, i: number) =>
  Math.hypot(s.cols[c0][i], s.cols[c0 + 1][i], s.cols[c0 + 2][i]);

const SIGNALS = {
  ankle: { name: 'Ankle (magnitude)', get: (s: Segment, i: number) => mag(s, 0, i) },
  thigh: {
    name: 'Thigh, above the knee (magnitude)',
    get: (s: Segment, i: number) => mag(s, 3, i),
  },
  trunk: { name: 'Hip / lower back (magnitude)', get: (s: Segment, i: number) => mag(s, 6, i) },
  ankleVertical: {
    name: 'Ankle, vertical axis only (as in the papers)',
    get: (s: Segment, i: number) => s.cols[1][i],
  },
} as const;
type SignalKey = keyof typeof SIGNALS;

// ------------------------------------------------------------------ events
interface FreezeEvent {
  subject: number;
  seg: number;
  onset: number;
  end: number;
}
const events: FreezeEvent[] = [];
segments.forEach((s, si) => {
  let start: number | null = null;
  for (let i = 0; i < s.t.length; i++) {
    if (s.label[i] === 2 && start === null) start = s.t[i];
    if (s.label[i] !== 2 && start !== null) {
      events.push({ subject: s.subject, seg: si, onset: start, end: s.t[i - 1] });
      start = null;
    }
  }
  if (start !== null) events.push({ subject: s.subject, seg: si, onset: start, end: s.t.at(-1)! });
});
const subjects = [...new Set(segments.map((s) => s.subject))].sort((a, b) => a - b);
const hoursOf = (subs: number[]) =>
  segments
    .filter((s) => subs.includes(s.subject))
    .reduce((h, s) => h + (s.t.at(-1)! - s.t[0]) / 3.6e6, 0);

// ------------------------------------------------------------------ frames
interface Frame {
  subject: number;
  seg: number;
  t: number;
  fi: number;
  power: number;
  label: number;
}
function framesFor(key: SignalKey): Frame[] {
  const out: Frame[] = [];
  segments.forEach((s, si) => {
    let i = 0;
    const det = new FreezeDetector({ fi: Infinity, power: Infinity }, (f) => {
      // label at the newest sample of the window
      while (i < s.t.length - 1 && s.t[i + 1] <= f.t) i++;
      out.push({
        subject: s.subject,
        seg: si,
        t: f.t,
        fi: f.fi,
        power: f.totalPower,
        label: s.label[i],
      });
    });
    const get = SIGNALS[key].get;
    for (let k = 0; k < s.t.length; k++) det.push(s.t[k], get(s, k));
  });
  return out;
}

// ------------------------------------------------------------------ scoring
interface Score {
  sens: number;
  spec: number;
  gmean: number;
  events: number;
  detected: number;
  latenciesS: number[];
  falseAlarms: number;
  hours: number;
}

/**
 * Same enter/leave hold as FreezeDetector: on after `enter` windows over threshold in a row,
 * off after 2 under. (The app uses enter = 1; larger values are reported as a trade-off.)
 */
function decide(frames: Frame[], th: FreezeThresholds, enter = 1): boolean[] {
  const out: boolean[] = [];
  let seg = -1;
  let under = 0;
  let overRun = 0;
  let on = false;
  for (const f of frames) {
    if (f.seg !== seg) {
      seg = f.seg;
      under = 0;
      overRun = 0;
      on = false;
    }
    const over = f.fi > th.fi && f.power > th.power;
    if (over) {
      under = 0;
      if (++overRun >= enter) on = true;
    } else {
      overRun = 0;
      if (++under >= 2) on = false;
    }
    out.push(on);
  }
  return out;
}

function score(frames: Frame[], th: FreezeThresholds, subs: number[], enter = 1): Score {
  const flags = decide(frames, th, enter);
  let tp = 0,
    fn = 0,
    tn = 0,
    fp = 0;
  frames.forEach((f, i) => {
    if (!subs.includes(f.subject)) return;
    if (f.label === 2) {
      if (flags[i]) tp++;
      else fn++;
    } else if (flags[i]) fp++;
    else tn++;
  });
  const evs = events.filter((e) => subs.includes(e.subject));
  const latencies: number[] = [];
  let detected = 0;
  for (const e of evs) {
    const hit = frames.findIndex(
      (f, i) => flags[i] && f.seg === e.seg && f.t >= e.onset - 2000 && f.t <= e.end + 1000,
    );
    if (hit >= 0) {
      detected++;
      latencies.push((frames[hit].t - e.onset) / 1000);
    }
  }
  // False alarms: flagged stretches not overlapping any freeze (±2 s).
  let falseAlarms = 0;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (
      !subs.includes(f.subject) ||
      !flags[i] ||
      (i > 0 && flags[i - 1] && frames[i - 1].seg === f.seg)
    )
      continue;
    let j = i;
    while (j + 1 < frames.length && flags[j + 1] && frames[j + 1].seg === f.seg) j++;
    const a = f.t - 4000; // the window that raised it started 4 s earlier
    const b = frames[j].t;
    const overlaps = events.some(
      (e) => e.seg === f.seg && a <= e.end + 2000 && b >= e.onset - 2000,
    );
    if (!overlaps) falseAlarms++;
  }
  const sens = tp / Math.max(1, tp + fn);
  const spec = tn / Math.max(1, tn + fp);
  return {
    sens,
    spec,
    gmean: Math.sqrt(sens * spec),
    events: evs.length,
    detected,
    latenciesS: latencies,
    falseAlarms,
    hours: hoursOf(subs),
  };
}

/** Best thresholds (by √(sens×spec)) on the frames of the given subjects. */
function choose(frames: Frame[], subs: number[]): FreezeThresholds {
  const fr = frames.filter((f) => subs.includes(f.subject));
  const powers = fr.map((f) => f.power).sort((a, b) => a - b);
  const q = (p: number) => powers[Math.floor(p * (powers.length - 1))];
  const fiGrid = Array.from({ length: 28 }, (_, i) => 0.25 * Math.pow(1.2, i)); // 0.25 .. ~35
  const powerGrid = [0, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6].map(q);
  let best: FreezeThresholds = { fi: 1, power: 0 };
  let bestG = -1;
  for (const fi of fiGrid)
    for (const power of powerGrid) {
      // Window-level only (fast): no need for events while choosing.
      let tp = 0,
        fn = 0,
        tn = 0,
        fp = 0;
      const flags = decide(fr, { fi, power });
      fr.forEach((f, i) => {
        if (f.label === 2) {
          if (flags[i]) tp++;
          else fn++;
        } else if (flags[i]) fp++;
        else tn++;
      });
      const g = Math.sqrt((tp / Math.max(1, tp + fn)) * (tn / Math.max(1, tn + fp)));
      if (g > bestG) {
        bestG = g;
        best = { fi, power };
      }
    }
  return best;
}

function addScores(a: Score, b: Score): Score {
  // Pool window counts by re-weighting is messy; we pool events and keep the mean of window rates.
  return {
    sens: a.sens + b.sens,
    spec: a.spec + b.spec,
    gmean: 0,
    events: a.events + b.events,
    detected: a.detected + b.detected,
    latenciesS: [...a.latenciesS, ...b.latenciesS],
    falseAlarms: a.falseAlarms + b.falseAlarms,
    hours: a.hours + b.hours,
  };
}

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const summarise = (s: Score) => ({
  windowSensitivity: round(s.sens, 3),
  windowSpecificity: round(s.spec, 3),
  eventsDetected: s.detected,
  events: s.events,
  eventDetectionRate: round(s.detected / Math.max(1, s.events), 3),
  medianLatencyS: s.latenciesS.length ? round(median(s.latenciesS), 1) : null,
  falseAlarms: s.falseAlarms,
  falseAlarmsPerHour: round(s.falseAlarms / Math.max(1e-9, s.hours), 1),
  hours: round(s.hours, 2),
});

// ------------------------------------------------------------------ run
console.log(
  `Loaded ${segments.length} segments from ${subjects.length} subjects, ${events.length} freeze episodes, ${round(hoursOf(subjects))} h of experiment.`,
);
const freezeSubjects = subjects.filter((s) => events.some((e) => e.subject === s));

const results: Record<string, unknown> = {};
const thresholds: Record<string, FreezeThresholds> = {};
const allFrames: Partial<Record<SignalKey, Frame[]>> = {};

for (const key of Object.keys(SIGNALS) as SignalKey[]) {
  const frames = framesFor(key);
  allFrames[key] = frames;
  const th = choose(frames, subjects);
  thresholds[key] = { fi: round(th.fi, 3), power: round(th.power, 4) };
  const tuned = score(frames, th, subjects);

  // Leave one subject out.
  let pooled: Score | null = null;
  const perSubject: Record<string, unknown> = {};
  for (const s of subjects) {
    const thS = choose(
      frames,
      subjects.filter((x) => x !== s),
    );
    const sc = score(frames, thS, [s]);
    perSubject[`S${String(s).padStart(2, '0')}`] = {
      thresholds: { fi: round(thS.fi, 3), power: round(thS.power, 4) },
      ...summarise(sc),
    };
    pooled = pooled ? addScores(pooled, sc) : sc;
  }
  // Window rates: average over patients who froze (sensitivity) / all patients (specificity).
  const sensAvg =
    freezeSubjects.reduce(
      (a, s) =>
        a +
        (perSubject[`S${String(s).padStart(2, '0')}`] as { windowSensitivity: number })
          .windowSensitivity,
      0,
    ) / freezeSubjects.length;
  const specAvg =
    subjects.reduce(
      (a, s) =>
        a +
        (perSubject[`S${String(s).padStart(2, '0')}`] as { windowSpecificity: number })
          .windowSpecificity,
      0,
    ) / subjects.length;
  const loso = {
    ...summarise(pooled!),
    windowSensitivity: round(sensAvg, 3),
    windowSpecificity: round(specAvg, 3),
  };

  // Waiting longer before declaring a freeze: fewer false alarms, more missed or late freezes.
  const confirmationTradeoff = [1, 2, 4, 6].map((enter) => ({
    confirmS: enter * (FREEZE_HOP / FREEZE_RATE_HZ),
    ...summarise(score(frames, th, subjects, enter)),
  }));

  results[key] = {
    signal: SIGNALS[key].name,
    thresholdsTunedOnAll: thresholds[key],
    tunedOnAll: summarise(tuned),
    confirmationTradeoff,
    leaveOneSubjectOut: loso,
    perSubject,
  };
  console.log(
    `${SIGNALS[key].name.padEnd(46)} tuned: events ${tuned.detected}/${tuned.events}, sens ${round(tuned.sens)}, spec ${round(tuned.spec)}, FA/h ${round(tuned.falseAlarms / tuned.hours, 1)} | LOSO: events ${loso.eventsDetected}/${loso.events}, sens ${loso.windowSensitivity}, spec ${loso.windowSpecificity}, FA/h ${loso.falseAlarmsPerHour}, latency ${loso.medianLatencyS}s`,
  );
}

const meta = {
  dataset: 'Daphnet Freezing of Gait (UCI ML Repository, CC BY 4.0), Bächlin et al. 2010',
  generated: new Date().toISOString().slice(0, 10),
  subjects: subjects.length,
  subjectsWithFreezes: freezeSubjects.length,
  freezeEpisodes: events.length,
  experimentHours: round(hoursOf(subjects)),
  method: {
    rateHz: FREEZE_RATE_HZ,
    windowS: FREEZE_WINDOW / FREEZE_RATE_HZ,
    hopS: FREEZE_HOP / FREEZE_RATE_HZ,
    locomotionBandHz: [0.5, 3],
    freezeBandHz: [3, 8],
    hold: 'enter after 1 window over threshold, leave after 2 under',
    eventMatch: 'flag between 2 s before onset and 1 s after the end',
    falseAlarm: 'flagged stretch not overlapping any freeze ±2 s',
    thresholdChoice: 'grid search maximising sqrt(sensitivity × specificity), window level',
  },
};
writeFileSync(
  resolve(root, 'docs/daphnet-results.json'),
  JSON.stringify({ meta, results }, null, 2),
);

// ------------------------------------------------------------------ thresholds for the app
const r = (k: SignalKey) =>
  (results[k] as { leaveOneSubjectOut: ReturnType<typeof summarise> }).leaveOneSubjectOut;
writeFileSync(
  resolve(root, 'packages/shared/src/dsp/freezeThresholds.ts'),
  `/**
 * GENERATED by \`npm run daphnet\` (scripts/daphnet.ts) on ${meta.generated}. Do not edit by hand.
 * Freeze-index thresholds chosen on the Daphnet dataset, per sensor position, and the
 * leave-one-subject-out results (the fair estimate) for the Studio to show.
 */
import type { FreezeThresholds } from './freeze';

export const FREEZE_THRESHOLDS: Record<'ankle' | 'thigh' | 'trunk', FreezeThresholds> = ${JSON.stringify(
    { ankle: thresholds.ankle, thigh: thresholds.thigh, trunk: thresholds.trunk },
    null,
    2,
  )};

export const DAPHNET_RESULTS = ${JSON.stringify(
    {
      episodes: meta.freezeEpisodes,
      subjects: meta.subjects,
      hours: meta.experimentHours,
      ankle: r('ankle'),
      thigh: r('thigh'),
      trunk: r('trunk'),
    },
    null,
    2,
  )};
`,
);

writeEvaluationDoc(meta, results);

// ------------------------------------------------------------------ write-up
function writeEvaluationDoc(
  meta: Record<string, unknown> & { generated: string },
  results: Record<string, unknown>,
) {
  type R = {
    signal: string;
    thresholdsTunedOnAll: FreezeThresholds;
    tunedOnAll: ReturnType<typeof summarise>;
    leaveOneSubjectOut: ReturnType<typeof summarise>;
    confirmationTradeoff: (ReturnType<typeof summarise> & { confirmS: number })[];
  };
  const rs = results as Record<SignalKey, R>;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const row = (k: SignalKey, x: ReturnType<typeof summarise>) =>
    `| ${rs[k].signal} | ${pct(x.windowSensitivity)} | ${pct(x.windowSpecificity)} | ${x.eventsDetected}/${x.events} (${pct(x.eventDetectionRate)}) | ${x.medianLatencyS} s | ${x.falseAlarmsPerHour} |`;
  const keys = Object.keys(rs) as SignalKey[];
  const head =
    '| Signal | Freeze windows flagged (sensitivity) | Other windows left alone (specificity) | Freeze episodes caught | Median latency | False alarms per hour |\n|---|---|---|---|---|---|';
  const md = `# Freeze detection on the Daphnet dataset

Generated by \`npm run daphnet\` (scripts/daphnet.ts) on ${meta.generated}. The numbers come
from running **the same detector code the app uses** (packages/shared/src/dsp/freeze.ts).

## Data

- **Daphnet Freezing of Gait** (UCI Machine Learning Repository, CC BY 4.0). Bächlin et al.,
  *Wearable Assistant for Parkinson's Disease Patients With the Freezing of Gait Symptom*,
  IEEE Trans. Inf. Technol. Biomed. 14(2), 2010.
- Download: https://archive.ics.uci.edu/static/public/245/daphnet+freezing+of+gait.zip,
  unzip into \`scripts/daphnet/raw/\`.
- Checked after download: 64 Hz; columns are time (ms), then ankle, thigh and trunk
  acceleration (forward, vertical, lateral; in mg), then the annotation (0 not part of the
  experiment, 1 no freeze, 2 freeze).
- We used ${meta.subjects} patients (${meta.subjectsWithFreezes} of them froze),
  **${meta.freezeEpisodes} freeze episodes** (matches the paper's 237) and
  ${meta.experimentHours} h of annotated experiment (rows marked 0 dropped).

## Method

- Freeze index (Moore et al. 2008) = power in 3–8 Hz ÷ power in 0.5–3 Hz, over a 4 s window
  every 0.5 s, plus a minimum total power so standing still is not called a freeze.
- Signal: acceleration **magnitude** (orientation-free, which a phone in a pocket needs).
  The ankle's vertical axis alone is included for comparison with the papers.
- Thresholds: grid search maximising √(sensitivity × specificity) at window level.
- **Fair estimate: leave one patient out.** For each patient, the thresholds are chosen on the
  other nine and then tested on them. "Tuned on all" is shown too, but it is optimistic.
- A freeze episode counts as caught if flagged between 2 s before it starts and 1 s after it
  ends. Latency is first flag minus annotated start (negative = flagged before the annotated
  start; annotations can be a couple of hundred ms off, and the 4 s window sees the
  shuffling that often comes just before a freeze).
- A false alarm is a flagged stretch that does not overlap any freeze (±2 s).

## Results: leave one patient out (the fair numbers)

${head}
${keys.map((k) => row(k, rs[k].leaveOneSubjectOut)).join('\n')}

(Sensitivity is averaged over the ${meta.subjectsWithFreezes} patients who froze, specificity
over all ${meta.subjects}.)

## Results: thresholds tuned on everyone (optimistic)

${head}
${keys.map((k) => row(k, rs[k].tunedOnAll)).join('\n')}

Thresholds the app uses (tuned on all patients):
${(['ankle', 'thigh', 'trunk'] as const).map((k) => `- ${rs[k].signal}: FI > ${rs[k].thresholdsTunedOnAll.fi}, power > ${rs[k].thresholdsTunedOnAll.power}`).join('\n')}

## Waiting longer before calling a freeze

Ankle, thresholds tuned on all:

| Wait before flagging | Episodes caught | Median latency | False alarms per hour |
|---|---|---|---|
${rs.ankle.confirmationTradeoff.map((x) => `| ${x.confirmS} s | ${pct(x.eventDetectionRate)} | ${x.medianLatencyS} s | ${x.falseAlarmsPerHour} |`).join('\n')}

Thigh (the sensor closest to a trouser pocket):

| Wait before flagging | Episodes caught | Median latency | False alarms per hour |
|---|---|---|---|
${rs.thigh.confirmationTradeoff.map((x) => `| ${x.confirmS} s | ${pct(x.eventDetectionRate)} | ${x.medianLatencyS} s | ${x.falseAlarmsPerHour} |`).join('\n')}

## What this means (honestly)

- **Comparable with the published baseline.** Bächlin et al. report 73.1% sensitivity and
  81.6% specificity for their online system (from the paper's abstract; their setup and
  scoring differ from ours, so this is a rough comparison, not a like-for-like one).
- **The ankle is best, and sensors higher up the body do worse:** the thigh and hip lose
  specificity. A phone in a pocket sits between the thigh and hip sensors, so expect it to do
  no better than those rows, and probably worse (a loose phone in a pocket moves about).
- **Far too many false alarms for real life.** Tens of false alarms an hour would make the
  music jump into recovery mode constantly. These recordings were designed to provoke
  freezing (lots of turns, doorways, stopping), and turning also puts energy in the freeze
  band. Waiting longer cuts false alarms but misses more freezes.
- **This is why live phone freeze detection is labelled experimental** and does not change the
  music by default; the demo uses a "Simulate freeze" button.
- Episode detection rates look high partly because freezes in this data are frequent and we
  allow ±2 s; read them together with the false-alarm rate.
`;
  writeFileSync(resolve(root, 'docs/daphnet-evaluation.md'), md);
}
