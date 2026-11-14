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
| 3     | Phone to laptop link + clock sync    |        |
| 4     | Calibration + steady beat            |        |
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

Tests: `npm test` (step detector on synthetic walks with known step times).

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
