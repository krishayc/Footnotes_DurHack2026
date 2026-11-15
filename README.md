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
| 8     | Freeze detection + Daphnet           |                                |
| 9     | Demo hardening                       |                                |
| 10    | Submission materials                 |                                |

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

Other scripts: `npm run typecheck`, `npm run lint`, `npm run format`.

## Architecture

```
 [Phone: /sensor]  --WebSocket /ws-->  [Node relay server]  --WebSocket /ws-->  [Laptop: /studio]
  accelerometer, step detection          rooms by 4-letter code               clock sync, Tone.js music,
  sends steps + raw accel batches        serves the built web app             sync scoring, arrangement,
                                          GET /health                          visual score, freeze detection
```

```
apps/web/            Vite + React + TypeScript (routes: / , /sensor , /studio)
  src/styles/        design tokens (colours, type, spacing, radii, motion) as CSS variables
  src/ui/            Button (big, debounced), Logo, icons
  src/landing/       role picker + room code entry + device checks
  src/sensor/        phone app: motion sensor (ring buffer, permission, rate), wake lock, live graph
  src/studio/        laptop studio
  public/samples/    bundled audio samples (offline)
  public/replays/    preprocessed Daphnet clips
apps/server/         Node + ws relay, static hosting
packages/shared/     message protocol, room codes, and DSP (step detector + tests) used by web, server and scripts
scripts/daphnet/     dataset preprocessing + freeze-index evaluation
docs/                research notes, HTTPS setup, demo script, pitch
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

_Being written. Every figure is marked "to verify" until checked against the source._

## Limitations

_Being written._

## Credits and licences

- Fonts: Atkinson Hyperlegible and Bricolage Grotesque, SIL Open Font License, via Fontsource.
- Daphnet Freezing of Gait dataset (UCI ML Repository, CC BY 4.0): _to be added in Stage 8._
