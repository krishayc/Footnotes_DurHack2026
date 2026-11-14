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

| Stage | What                                 | Status |
| ----- | ------------------------------------ | ------ |
| 0     | Plan, scaffold, design tokens, HTTPS | Done   |
| 1     | Phone sensor page                    | Done   |
| 2     | Step detection                       | Done   |
| 3     | Phone to laptop link + clock sync    | Done   |
| 4     | Calibration + steady beat            | Done   |
| 5     | Sync scoring                         |        |
| 6     | Adaptive arrangement                 |        |
| 7     | Visual score + patient screens       |        |
| 8     | Freeze detection + Daphnet           |        |
| 9     | Demo hardening                       |        |
| 10    | Submission materials                 |        |

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
2. **Tempo = pace × (1 + offset)**, default +5%, adjustable 0 to +15%, clamped to 70 to 130 BPM.
   "A bit slower / faster" nudges by 2 BPM; any change glides over 4 beats.
3. **The beat leads.** Tone.js schedules each beat on the audio hardware clock, so it cannot
   waver even if the page is busy. Measured: beats exactly 594.059 ms apart at 101 BPM, spread
   0.000 ms on the audio clock (0.085 ms after converting to the step clock).
4. **Fallbacks:** Tap mode (spacebar or a big pad = one step) and a Simulated walker with
   adjustable pace and unevenness. Every step source feeds the same "step bus", so everything
   downstream works the same whichever is active.

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
