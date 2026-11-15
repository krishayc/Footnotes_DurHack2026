<p align="center"><img src="apps/web/public/favicon.svg" width="72" alt="Footnotes logo"></p>

# Footnotes

> Footnotes turns a clinical walking aid into a living piece of music that grows when you walk in time with it.

Built at **DurHack 2026** (theme: _Composition_). _Notes made by your feet, and a footnote: the small detail that supports something bigger._

**A research-informed prototype. Not a medical device.**

## The idea

A phone in your pocket measures your steps. Footnotes plays a steady beat set just above your
natural walking pace (Rhythmic Auditory Stimulation, RAS). **The beat always leads and never
chases you.** What changes is the music built on top: lock into the beat and it blooms (bass,
harmony, melody come in); drift and it strips back to a clear, simple beat that is easy to find
again. If a freeze of gait is detected, the music switches to a calm, recognisable recovery cue.
A live visual score on the laptop shows the walker and the music locking together.

## Status

| Stage | What                                 | Status                         |
| ----- | ------------------------------------ | ------------------------------ |
| 0     | Plan, scaffold, design tokens, HTTPS | Done                           |
| 1     | Phone sensor page                    | Done                           |
| 2     | Step detection                       | Done                           |
| 3     | Phone to laptop link + clock sync    | Done                           |
| 4     | Calibration + steady beat            | Done                           |
| 5     | Sync scoring                         | Done                           |
| 6     | Adaptive arrangement                 | Done (listening check pending) |
| 7     | Visual score + patient screens       | Done                           |
| 8     | Freeze detection + Daphnet           | Done                           |
| 9     | Demo hardening                       | Done                           |
| 10    | Submission materials                 | Done                           |

## Documents

- [docs/demo-script.md](docs/demo-script.md): the 3-minute demo, fallbacks, and what to do if something goes wrong
- [docs/pitch.md](docs/pitch.md): 30-second pitch, 3-minute table pitch, answers to likely judge questions
- [docs/devpost.md](docs/devpost.md): the Devpost write-up
- [docs/daphnet-evaluation.md](docs/daphnet-evaluation.md): freeze detection tested on real patient data
- [docs/https-setup.md](docs/https-setup.md): getting the phone connected (tunnel, hotspot)

## Run it

Requires Node 20+.

```bash
npm install
npm run dev            # relay server on :8787, web app on http://localhost:5173
```

- Laptop: open http://localhost:5173 → **I'm the Studio**.
- Phone: needs HTTPS for motion sensors. See [docs/https-setup.md](docs/https-setup.md).

Demo build (single port, served by the relay):

```bash
npm run demo           # http://localhost:8787
npm run tunnel         # public https URL for the phone
```

Tests: `npm test` (step detector on synthetic walks with known step times; clock sync on a
simulated jittery network).

No phone handy? `npm run fake-phone -- ABCD` joins room ABCD as a pretend phone that walks at
105 steps/min (add a tunnel URL as the second argument to go through Cloudflare).

Tuning on real walks: on the phone's pocket screen tap **Record 30 seconds for tuning**; the
laptop saves `recordings/walk-<time>.json`. Then `npm run analyze -- recordings/<file> --steps 40`
replays it through the detector, compares settings and draws the walk as `<file>.html`.

Freeze detection test: download the Daphnet zip (link in
[docs/daphnet-evaluation.md](docs/daphnet-evaluation.md)) into `scripts/daphnet/raw/`, then
`npm run daphnet` (about 10 s): writes the results to `docs/`, the thresholds to
`packages/shared`, and the replay clips to `apps/web/public/replays/`.

Other scripts: `npm run typecheck`, `npm run lint`, `npm run format`.

## Architecture

```
 [Phone: /sensor]  --WebSocket /ws-->  [Node relay server]  --WebSocket /ws-->  [Laptop: /studio]
  accelerometer, step detection          rooms by 4-letter code               clock sync, Tone.js music,
  sends steps + raw accel batches        serves the built web app             sync scoring, arrangement,
                                          GET /health                          visual score, freeze detection
```

The music is fully synthesised in the browser (Tone.js), so there are no sample files to load.

```
apps/web/            Vite + React + TypeScript (routes: / , /sensor , /studio)
  src/styles/        design tokens (colours, type, spacing, radii, motion) as CSS variables
  src/ui/            Button (big, debounced), Logo, icons
  src/landing/       role picker + room code entry + device checks
  src/patient/       the phone app a patient sees (setup, walking, after the walk, history, settings)
  src/sensor/        motion sensor, wake lock, step tracker, link to the laptop, developer screen
  src/shared/        WebSocket connection, stores, ring buffers, haptics
  src/studio/        laptop Studio: audio engine, band + arranger, sync, visual score, freeze
                     watch, Daphnet replay, demo guide, About and research
  public/replays/    Daphnet replay clips (made by npm run daphnet)
apps/server/         Node + ws relay, static hosting, recordings endpoint
packages/shared/     message protocol, room codes, clock sync, DSP (steps, calibration, sync,
                     arrangement, freeze index) + tests, used by web, server and scripts
scripts/             tunnel, fake phone, walk analyser, Daphnet evaluation (daphnet.ts)
docs/                HTTPS setup, Daphnet evaluation, demo script, pitch, Devpost write-up
```

## Calibration and the steady beat

1. **Find their pace:** the walker walks naturally for 20 s with no music. We drop the first 3
   steps (starting is the least typical part) and take the **median** gap between steps, so a
   missed or doubled step barely matters. Too few steps or very uneven timing gets a kind
   "let's try again" note.
2. **Tempo = pace × (1 + offset)**, default +5%, adjustable 0 to +15%, clamped to 70 to 100 BPM (100 is our demo cap for a calm walking beat, not a research number; with no pace measured the beat is 90).
   "A bit slower / faster" nudges by 2 BPM; any change glides over 4 beats.
3. **The beat leads.** Tone.js schedules each beat on the audio hardware clock, so it cannot
   waver even if the page is busy. Measured: beats exactly 594.059 ms apart at 101 BPM, spread
   0.000 ms on the audio clock (0.085 ms after converting to the step clock).
4. **Fallbacks:** Tap mode (spacebar or a big pad = one step) and a Simulated walker with
   adjustable pace and unevenness. Every step source feeds the same "step bus", so everything
   downstream works the same whichever is active.

## Sync scoring (how in step are they?)

- **Phase** of each step: where it lands relative to the nearest beat, from −0.5 (half a beat
  early) to +0.5 (half a beat late). Picture the beat as a clock face; each step is a point on it.
- **Circular statistics** over the last 8 steps, the standard tool in sensorimotor
  synchronisation research: average the steps as unit arrows. The arrow's length **R** (0 to 1)
  says how consistent the timing is; its direction is the **mean phase** (early or late). An
  ordinary average fails here because phase wraps: +0.49 and −0.49 are almost the same moment.
- **Tempo match**: their pace ÷ the beat; within ±3% is free, further off is penalised.
- **Score** = R × tempo factor × a gentle on-the-beat factor, then smoothed so it never flickers,
  and fading if the steps stop.
- Measured with the Simulated walker against a 100 BPM beat: following the beat scores
  **0.98** (R 0.99); walking at its own 94 steps/min scores **0.25** (R 0.42); after locking
  back in it climbs from 0.25 to 0.89 in about 7 s; the largest change in any 250 ms when
  locked is 0.006.
- A **timing correction** slider cancels constant delays (speakers, step detection).

## Catching the far leg

A phone in one pocket feels the far leg's footfall only faintly, so that bump can stay under
the step threshold and every other step goes missing (dots every 1-2 beats). When two steps
are about twice the usual step apart, the detector looks back between them for a smaller bump
near the middle and counts it at its real time. It never invents a step where there is no bump.
On simulated walks with the far leg at 20% of the pocket leg's strength, this raised the steps
caught from about 55% to 99%, with no extra steps on normal walks or a still phone. These are
simulated walks; a real pocket walk is still the test that matters.

## The music (adaptive arrangement)

- **Fixed key and chords:** D major, a 4-bar loop **Dmaj7 → Bm7 → Gmaj7 → A7sus4** (the
  I–vi–IV–V shape softened with 7ths). The harmony never changes; only the layers do.
- **Layers:** L0 Pulse (always on, the loudest timing reference), L1 Shakers, L2 Bass,
  L3 Keys (electric-piano style), L4 Melody (a 4-bar pentatonic motif with an answering
  variation), L5 Sparkle (a quiet high arpeggio).
- **All synthesised in code** with Tone.js: works offline, no sample licences, nothing extra to
  download. Each voice is filtered and enveloped to be soft; a shared reverb, compressor and
  limiter glue the mix and stop any harsh peak.
- **Balanced by measurement:** each layer is rendered offline and its loudness measured
  (`await __fn.measureMix()` in the dev console). The pulse sits about 9 dB above the bass and
  about 13 dB above the keys and melody.
- **Arrangement rules:** sync score → number of layers, with **hysteresis** (a layer enters
  at a higher score than it leaves: e.g. Bass in at 45%, out below 35%) so nothing flickers.
  Changes happen only on bar lines with short fades; the music builds **one layer per bar**
  and strips back **up to two per bar**, so a struggling walker quickly gets a simpler beat.
- **Measured** with the Simulated walker: locked in = all 6 parts; walking at its own pace
  strips back to the pulse alone within 4 bars (~10 s); locking back in rebuilds one layer per
  bar to the full arrangement.
- **Debug panel:** press **D** on the Studio to fake the score or force any layer on/off.

## The two screens

**Laptop Studio (for judges).** The main area is a **visual score** drawn from the music itself:
each layer is a lane that appears only while it plays and is drawn from the actual notes
(melody and keys as flowing lines, bass as a stepped line, shakers as dots, sparkle as
twinkles), above a steps lane where the beat is shown as marigold bars and each step as a dot
placed by its timing. Beside it: the in-step percentage in plain words, pace, beat, layers and
freeze watch. **Under the hood** (button or **H**) opens the technical view: raw phone signal,
the phase circle and R, clock sync and latency, how the phone counts, and music debug.

**Phone (the patient app).** Welcome (3 cards, first run) → Home → Step 1 _Let's find your
pace_ (spoken 3-2-1 count-in, 20 s ring, chime) → Step 2 _Your beat is ready_ (a circle that
pulses exactly on the laptop's beat, using the clock sync) → **Walking** (dark, the whole
screen is a press-and-hold stop target; taps and pocket bumps are ignored) → _End your walk?_
→ **After the walk** (the walk drawn as music on five staff lines, plain-words summary,
_Hear my walk_, _Send to physio_) plus **My walks** and **Settings** (beat offset, voice
guidance, text size, hold-to-stop time). Every screen has a read-aloud button; buttons are 84
to 128 px, debounced against tremor; no swipes or small targets; reduced motion respected.
The hidden **developer screen** (tap the version in Settings 5 times) keeps the signal graph,
step tuning and walk recording. The phone drives the laptop (find my pace, start/stop, a bit
faster/slower) and the laptop reports back the phase, beat, score and layers.

## Freeze detection (and the Daphnet test)

- **Freeze index** (Moore et al. 2008): power at 3–8 Hz (trembling) ÷ power at 0.5–3 Hz
  (walking), over a 4 s window every 0.5 s, plus a minimum movement power so standing still
  isn't a freeze. One shared implementation
  ([packages/shared/src/dsp/freeze.ts](packages/shared/src/dsp/freeze.ts)) runs in the
  evaluation, the replay and the live phone watch.
- **Tested on real patients:** `npm run daphnet` runs it on the whole Daphnet dataset (10
  patients, 237 annotated freezes) for the ankle, thigh and hip sensors, picks thresholds and,
  to be fair, re-tests with each patient left out. Full results:
  [docs/daphnet-evaluation.md](docs/daphnet-evaluation.md). In short: the ankle works best
  (about 86% of freeze time flagged, 77% of normal time left alone, comparable with the
  original paper), sensors higher up do worse, and **all of them give far too many false
  alarms for daily life** (about 115+ an hour in this freeze-provoking lab data).
- **Recovery mode:** on the next beat after a freeze is flagged, every layer fades out and a
  calm, recognisable motif (D F♯ A F♯ | E G A) plays on every beat over the unchanged pulse.
  No tempo change, no volume jump. When the freeze ends, the motif finishes its bar and the
  music rebuilds one layer per bar. The score turns a calm blue; the phone says "Take your
  time. Listen for the beat, then take a big step."
- **Replay real freeze (Daphnet)** in the Studio's bottom bar plays a real recording through
  the same pipeline (thigh signal → step detector; chosen sensor → freeze index), with a
  timeline of the physiotherapists' marked freeze against ours. Measured on Patient 7: the
  music builds to all 5 layers, the freeze (marked at 20.0 s) is flagged at 22.5 s, recovery
  plays, and the music is back to 5 layers 12 s after the freeze ends.
- **Live phone freeze index is experimental** and only shown by default (a tick-box lets it
  change the music). **Simulate freeze** is the fallback button.
- Replay clips: 4 clips, one per patient. Only 2 of 23 suitable freezes had no false alarm
  anywhere in a 40 s clip; the other two are labelled "(includes a false alarm)".

## Demo day

- **Demo guide** (Studio button, or **G**): the 3-minute judge script one step at a time, with
  a clock, the words to say, and a button for each step's action and its no-phone fallback
  (simulated walker, Simulate freeze). Tested end to end with only the fallbacks: calibration
  (92 steps/min → 97 BPM beat), bloom, drift back to the pulse, the real freeze replay, Under
  the hood, with no console errors.
- **About and research** (button, or **A**): what it is and isn't, sources (each checked
  against its abstract, or marked "to verify"), and honest limits.
- **Fallbacks:** Tap mode (spacebar or pad), Simulated walker, Replay real freeze, Simulate
  freeze. A refresh mid-walk offers one click to bring the music back.
- **Offline:** no external requests at run time (fonts, music and replay clips are bundled).
  With no internet the Cloudflare tunnel can't run: put laptop and phone on a phone hotspot and
  use `npm run dev:https` (see [docs/https-setup.md](docs/https-setup.md)). The laptop alone
  (tap, simulated walker, replay) needs no network at all.
- **Saved locally:** Studio volume, beat offset, step source and simulated walker settings;
  on the phone, preferences, step settings and walk history.
- Not yet measured: frame rate of the score on the demo laptop (my test browser was hidden,
  which pauses drawing). Check it looks smooth on the real laptop before the demo.

## Clock sync (phone ↔ laptop)

The phone stamps each step with its own clock; the laptop plays the beat on its clock. To
compare them, the Studio repeatedly pings the phone (5×/s for 3 s when it joins, then every
2 s). Each exchange gives a round trip `t2 − t0` and an offset estimate `t1 − (t0 + t2)/2`
whose error is at most half the round trip. We keep the 30 most recent exchanges, take the 5
with the fastest round trips, and use the median of their offsets. If three exchanges in a row
disagree by more than 0.5 s, the phone's clock restarted (page reload) and we start afresh.
Measured against the known truth with `npm run fake-phone`: **0.2 ms error on localhost and
about 1 ms through a Cloudflare tunnel** with 40 to 80 ms round trips.

## Design

Built for people with Parkinson's: huge touch targets (84px minimum, 128px hero), 600ms tap
debounce against tremor, text never below 18px, 4.5:1+ contrast, never colour alone, calm
motion that respects `prefers-reduced-motion`. Type is **Atkinson Hyperlegible** (designed by
the Braille Institute for low-vision readers) and **Bricolage Grotesque** for headings, both
bundled locally so the demo works offline.

## Research

- **Rhythmic Auditory Stimulation:** a 2022 meta-analysis of 18 randomised controlled trials
  (774 people with Parkinson's) found RAS improved stride length and gait speed and reduced
  freezing compared with controls. Ye et al., _Frontiers in Neurology_ 13:940419,
  https://doi.org/10.3389/fneur.2022.940419 (checked against the abstract).
- **Freeze index:** power at 3–8 Hz ÷ power at 0.5–3 Hz. Moore, MacDougall, Ondo, _J.
  Neurosci. Methods_ 167(2):340–348, 2008 (definition checked against the abstract).
- **Daphnet:** 10 patients, 237 freezes; Bächlin et al. 2010 report 73.1% sensitivity and
  81.6% specificity online (checked against the preprint shipped with the dataset).
- **Cue tempo:** studies range from below to roughly 5–25% above preferred cadence, with no
  single best value. _To verify._ We default to +5% and cap the demo at 100 BPM (our choice).

## Limitations

- Not a medical device; not tested with people with Parkinson's or physiotherapists.
- A pocket phone is not an ankle sensor: freeze detection from the phone is experimental and
  gives many false alarms (see [docs/daphnet-evaluation.md](docs/daphnet-evaluation.md)).
- Step detection is tuned on simulated walks and a few real ones; shuffling gait and walking
  aids are untested.
- The music plays on the laptop for the demo; real use needs it on the phone with wired
  headphones.

## Credits and licences

- Fonts: Atkinson Hyperlegible and Bricolage Grotesque, SIL Open Font License, via Fontsource.
- **Daphnet Freezing of Gait dataset** (UCI ML Repository, CC BY 4.0). Replay clips in
  `apps/web/public/replays/` are excerpts of it. Bächlin, Plotnik, Roggen, Maidan, Hausdorff,
  Giladi, Tröster, _Wearable Assistant for Parkinson's Disease Patients With the Freezing of
  Gait Symptom_, IEEE Trans. Inf. Technol. Biomed. 14(2):436–446, 2010.
