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

| Time      | Step            | Say                                                                                                                                                                                                                                                      | Do                                                                                                                               | No phone? (fallback)                        |
| --------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 0:00–0:30 | The problem     | "For people with Parkinson's, keeping a steady walking rhythm is hard, and sometimes they freeze mid-step. Walking to a steady beat is a well-studied technique called Rhythmic Auditory Stimulation. We turned that beat into a living piece of music." | Hand Judge 1 the phone.                                                                                                          | -                                           |
| 0:30–1:00 | Find their pace | "Pop the phone in your front pocket and walk on the spot, the way you normally do. No music yet: we're measuring your natural pace."                                                                                                                     | Judge presses **Start a walk → I'm ready**. The banner shows _Step 1 of 2 · Finding their pace_; steps land on the score.        | Guide button **No phone: simulated walker** |
| 1:00–1:45 | The bloom       | "Now walk to the beat. It's set just above your own pace. As your steps lock in, instruments join: shakers, bass, piano, melody."                                                                                                                        | Phone: **Start the main walk**. The banner flashes _Main walk started_. Point at the in-step % and the layers filling the score. | **Simulated walker follows the beat**       |
| 1:45–2:15 | Drift           | "Now walk out of time on purpose. The beat doesn't chase you: it stays rock steady, and the music strips back to a clear pulse that's easy to find again."                                                                                               | When they lock back in, it rebuilds one layer per bar.                                                                           | **Simulated walker drifts off**             |
| 2:15–2:40 | A real freeze   | "This is a real recording of a person with Parkinson's freezing, from a research dataset. Same pipeline: the freeze index spikes, the music switches to a calm recovery tune on the same beat, then rebuilds as they walk again."                        | Guide button **Replay a real freeze**. Point at the timeline (physios' marked freeze vs ours) and the blue score.                | **Simulate freeze** (press again to end it) |
| 2:40–3:00 | Under the hood  | "Step detection, clock sync between phone and laptop to the millisecond, circular statistics for the in-step score, and a freeze detector tested on 237 real freezes. Honestly: it works best at the ankle; from a pocket it's experimental."            | **Open Under the hood**. If asked about evidence: **About and research**.                                                        | -                                           |

The replay needs about 35 s to show walking, the freeze, and the rebuild; start it promptly.
The first recording (Patient 7) is the cleanest: the music builds to all layers, the freeze is
flagged about 2.5 s after the physios marked it, and the music is back to full about 12 s
after the freeze ends.

## If something goes wrong

| Problem                           | Fix                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| Phone says "Reconnecting"         | Wait 5 s; it retries by itself. Still stuck: reload the phone page (the laptop keeps the room).   |
| Header: "Phone quiet for N s"     | The phone screen went off. Unlock it; the walking screen keeps it awake once a walk starts.       |
| No steps on the laptop            | Check the bottom bar is on **Live phone**. Otherwise switch to **Simulated walker** and carry on. |
| Laptop page refreshed by accident | Click anywhere: "Click anywhere to bring the music back".                                         |
| No sound                          | Click **Start audio**; check the volume slider and the laptop's output.                           |
| Anything else                     | **Tap mode**: press the spacebar on every step. The music and score work exactly the same.        |
