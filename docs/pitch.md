# Pitch

## 30-second elevator pitch

People with Parkinson's often lose their walking rhythm, and some freeze mid-step. Walking to
a steady beat helps many of them: it's called Rhythmic Auditory Stimulation. But a metronome is
dull, and nobody keeps using something dull. **Footnotes turns that beat into music that grows
as you walk in time with it.** A phone in your pocket feels your steps; lock into the beat and
bass, piano and melody join in; drift and it strips back to a clear pulse. The beat never
chases you.

## 3-minute table pitch

Follow [demo-script.md](demo-script.md) (or the Studio's Demo guide, key **G**). The spine:

1. **Problem** (30 s): rhythm and freezing in Parkinson's; RAS is a well-studied cue; we
   made the cue musical.
2. **Calibration** (30 s): a judge walks; we measure their natural pace and set the beat just
   above it.
3. **Bloom** (45 s): walking in time brings in instruments; the visual score fills up.
4. **Drift** (30 s): out of time, the beat stays steady and the music simplifies.
5. **How it works** (45 s): step detection, clock sync, circular statistics; the beat never
   chases you; the limits.

## Likely judge questions

**Why not just use a metronome?**
The beat _is_ a metronome-grade timing reference: it's scheduled on the audio clock and its
spread is under a millisecond. The music around it adds motivation, and it gives feedback
about how well you're locking in without looking at a screen: more music means more in step.

**Does music actually help Parkinson's?**
Research supports RAS for some people: a 2022 meta-analysis of 18 randomised controlled
trials (774 people) found better stride length and gait speed and fewer freezing episodes
than controls. Effects vary between people. This is a research-informed prototype, not a
treatment.

**Why a phone and not a proper sensor?**
Everyone already has one. The trade-off is accuracy, and our Daphnet evaluation shows it
honestly: the ankle sensor detects freezes best; positions nearer a trouser pocket do worse.

**Is the freeze detection accurate?**
We use a published method (the freeze index, Moore et al. 2008) and tested it on all 237
annotated freezes in the Daphnet dataset, leaving each patient out when choosing thresholds.
At the ankle it flags about 86% of freeze time and leaves 77% of normal walking alone,
comparable with the original paper (73.1% / 81.6%). But it gives far too many false alarms
for daily life (100+ an hour in this lab data, where turns look like trembling). So we left
freeze detection out of the app.

**Why is this composition?**
The walker's movement composes the arrangement in real time: how in step they are decides
which instruments play, at musical moments (bar lines, with fades), and the same engine draws
the visual score from the notes actually played. Body, music and picture are one composition.

**What if the person walks to the wrong beat?**
The beat never chases them; that's the core rule. The music simplifies so the beat is easier
to hear and find again.

**What's technically hard here?**
Step detection from a noisy pocket sensor (including the faint far-leg step); syncing phone
and laptop clocks to about a millisecond over the internet; scoring "in step" with circular
statistics; arranging music that stays musical while it changes; and evaluating freeze
detection on real patient data, fairly.

**What would you do next?**
Co-design with people with Parkinson's and physiotherapists; move the music onto the phone
with wired headphones for real walks; try an ankle-worn sensor option; a proper clinical
evaluation.
