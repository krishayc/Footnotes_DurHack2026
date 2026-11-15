# Demo script (3 minutes)

The Studio's **Demo guide** (button, or press **G**) shows this script one step at a time with
a clock and buttons for each step. This file is the same script on paper.

## Before the judges arrive (5 minutes)

1. Laptop: `npm run demo` and `npm run tunnel` (no internet: phone hotspot and
   `npm run dev:https`, see [https-setup.md](https-setup.md)). Open
   `http://localhost:8787/studio`.
2. Laptop speakers or a wired speaker. **Not Bluetooth** (it delays the sound and throws the
   timing off).
3. Click **Start audio**. Scan the QR code with the phone and press **Start a walk** once to
   allow the motion sensor; then go back to Home.
4. Check the header says **Phone connected**. If not, see "If something goes wrong" below.
5. Press **G** for the demo guide, then **Start the clock** when the judges are ready.

## The script

| Time      | Step            | Say                                                                                                                                                                                                                                                      | Do                                                                                                                                 | No phone? (fallback)                        |
| --------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 0:00–0:30 | The problem     | "For people with Parkinson's, keeping a steady walking rhythm is hard, and sometimes they freeze mid-step. Walking to a steady beat is a well-studied technique called Rhythmic Auditory Stimulation. We turned that beat into a living piece of music." | Hand Judge 1 the phone.                                                                                                            | -                                           |
| 0:30–1:00 | Find their pace | "Pop the phone in your front pocket and walk on the spot, the way you normally do. No music yet: we're measuring your natural pace."                                                                                                                     | Judge presses **Start a walk → I'm ready**. The banner shows _Step 1 of 2 · Finding their pace_; steps land on the score.          | Guide button **No phone: simulated walker** |
| 1:00–1:45 | The bloom       | "Now walk to the beat. It's set just above your own pace. As your steps lock in, instruments join: shakers, bass, piano, melody."                                                                                                                        | Phone: **Start the main walk**. The banner flashes _Main walk started_. Point at the in-step % and the layers filling the score.   | **Simulated walker follows the beat**       |
| 1:45–2:15 | Drift           | "Now walk out of time on purpose. The beat doesn't chase you: it stays rock steady, and the music strips back to a clear pulse that's easy to find again."                                                                                               | When they lock back in, it rebuilds one layer per bar.                                                                             | **Simulated walker drifts off**             |
| 2:15–2:40 | A freeze        | "Sometimes people with Parkinson's freeze: the feet feel glued to the floor. When that happens, the music drops to the beat with a calm recovery tune on every beat, and rebuilds once they're moving. The beat never changes."                          | Guide button **Simulate freeze / end it**: press it, let the recovery tune play a few beats, press it again. The score turns blue. | -                                           |
| 2:40–3:00 | Under the hood  | "Step detection, clock sync between phone and laptop to the millisecond, circular statistics for the in-step score, and a freeze detector tested on 237 real freezes. Honestly: it works best at the ankle; from a pocket it's experimental."            | **Open Under the hood**. If asked about evidence: **About and research**.                                                          | -                                           |

Freeze detection itself was tested on 237 real freezes from patients (Daphnet dataset); the
results are in Under the hood and [daphnet-evaluation.md](daphnet-evaluation.md), if a judge
asks how a real freeze would be detected.

## If something goes wrong

| Problem                           | Fix                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| Phone says "Reconnecting"         | Wait 5 s; it retries by itself. Still stuck: reload the phone page (the laptop keeps the room).   |
| Header: "Phone quiet for N s"     | The phone screen went off. Unlock it; the walking screen keeps it awake once a walk starts.       |
| No steps on the laptop            | Check the bottom bar is on **Live phone**. Otherwise switch to **Simulated walker** and carry on. |
| Laptop page refreshed by accident | Click anywhere: "Click anywhere to bring the music back".                                         |
| No sound                          | Click **Start audio**; check the volume slider and the laptop's output.                           |
| Anything else                     | **Tap mode**: press the spacebar on every step. The music and score work exactly the same.        |
