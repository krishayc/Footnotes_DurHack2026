/**
 * Demo guide (press G): walks the presenter through the 3-minute judge script, one step at a
 * time, with a running clock, what to say, what to do, and a button for each step's action
 * (and its fallback). It only drives the same controls a person could press.
 */
import { useEffect, useState } from 'react';
import { useStore } from '../shared/store';
import { audio } from './audio/engine';
import { freezeWatch } from './freeze';
import { replay } from './replay';
import { session } from './session';
import { stepBus } from './steps';

interface Step {
  from: number; // seconds
  to: number;
  title: string;
  say: string;
  doText: string;
  action?: { label: string; run: () => void };
  fallback?: { label: string; run: () => void };
}

const sim = () => stepBus.setMode('sim');

const STEPS: Step[] = [
  {
    from: 0,
    to: 30,
    title: 'The problem',
    say: 'For people with Parkinson’s, keeping a steady walking rhythm is hard, and sometimes they freeze mid-step. Walking to a steady beat is a well-studied technique called Rhythmic Auditory Stimulation. We turned that beat into a living piece of music.',
    doText: 'Hand the judge the phone. Sound on, laptop speakers (not Bluetooth).',
    action: { label: 'Start audio', run: () => void audio.start() },
  },
  {
    from: 30,
    to: 60,
    title: 'Find their pace',
    say: 'Pop the phone in your front pocket and walk on the spot, the way you normally do. No music yet: we’re measuring your natural pace.',
    doText: 'Judge presses Start a walk, then I’m ready on the phone. Watch the steps land.',
    action: {
      label: 'Find their pace (laptop)',
      run: () => {
        stepBus.setMode('live');
        session.startCalibration();
      },
    },
    fallback: {
      label: 'No phone: simulated walker',
      run: () => {
        sim();
        stepBus.settings.set({ simFollow: false, simSpm: 92 });
        session.startCalibration();
      },
    },
  },
  {
    from: 60,
    to: 105,
    title: 'The bloom',
    say: 'Now walk to the beat. It’s set just above your own pace. As your steps lock in, instruments join: shakers, bass, piano, melody.',
    doText: 'Judge presses Start the main walk. Point at the in-step % and the score filling up.',
    action: { label: 'Start the beat (laptop)', run: () => session.startBeat() },
    fallback: {
      label: 'Simulated walker follows the beat',
      run: () => {
        sim();
        stepBus.settings.set({ simFollow: true });
        if (!audio.state.get().playing) session.startBeat();
      },
    },
  },
  {
    from: 105,
    to: 135,
    title: 'Drift',
    say: 'Now walk out of time on purpose. Notice the beat doesn’t chase you: it stays rock steady, and the music strips back to a clear pulse that’s easy to find again.',
    doText: 'When they lock back in, the music rebuilds one layer per bar.',
    fallback: {
      label: 'Simulated walker drifts off',
      run: () => {
        sim();
        stepBus.settings.set({ simFollow: false, simSpm: 88 });
      },
    },
  },
  {
    from: 135,
    to: 160,
    title: 'A real freeze',
    say: 'This is a real recording of a person with Parkinson’s freezing, from a research dataset. Same pipeline: the freeze index spikes, the music switches to a calm recovery tune on the same beat, then rebuilds as they walk again.',
    doText: 'Point at the timeline: the physios’ marked freeze versus ours, and the blue score.',
    action: {
      label: 'Replay a real freeze',
      run: () => {
        stepBus.setMode('replay');
        void replay.loadIndex().then(() => replay.play());
      },
    },
    fallback: {
      label: 'Simulate freeze',
      run: () => freezeWatch.setSimulated(!freezeWatch.state.get().simulated),
    },
  },
  {
    from: 160,
    to: 180,
    title: 'Under the hood',
    say: 'Under the hood: step detection, clock sync between phone and laptop to the millisecond, circular statistics for the in-step score, and the freeze detector tested on 237 real freezes. Honestly: it works best at the ankle, and from a pocket it’s experimental.',
    doText: 'Open Under the hood. Finish on About and research if asked about evidence.',
  },
];

export function DemoGuide({ onClose, onHood }: { onClose: () => void; onHood: () => void }) {
  const [i, setI] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => performance.now());
  const a = useStore(audio.state);
  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 500);
    return () => window.clearInterval(id);
  }, []);
  const s = STEPS[i];
  const el = startedAt === null ? 0 : (now - startedAt) / 1000;
  const mmss = (x: number) =>
    `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
  const late = startedAt !== null && el > s.to + 5;
  const action =
    i === 0 && a.status === 'on'
      ? undefined
      : i === STEPS.length - 1
        ? { label: 'Open Under the hood', run: onHood }
        : s.action;

  return (
    <aside className="guide" aria-labelledby="guide-h" aria-live="polite">
      <div className="guide__head">
        <h2 id="guide-h">
          Demo guide · {i + 1} of {STEPS.length}
        </h2>
        <span className={`guide__clock${late ? ' guide__clock--late' : ''}`}>
          {startedAt === null ? 'not started' : mmss(el)} · aim {mmss(s.from)}–{mmss(s.to)}
        </span>
      </div>
      <p className="guide__title">{s.title}</p>
      <p className="guide__say">“{s.say}”</p>
      <p className="guide__do">{s.doText}</p>
      <div className="guide__actions">
        {action && (
          <button type="button" className="modebar__btn" aria-pressed="true" onClick={action.run}>
            {action.label}
          </button>
        )}
        {s.fallback && (
          <button type="button" className="modebar__btn" onClick={s.fallback.run}>
            {s.fallback.label}
          </button>
        )}
      </div>
      <div className="guide__nav">
        <button
          type="button"
          className="modebar__btn"
          disabled={i === 0}
          onClick={() => setI(i - 1)}
        >
          Back
        </button>
        {startedAt === null ? (
          <button
            type="button"
            className="modebar__btn modebar__btn--hood"
            onClick={() => setStartedAt(performance.now())}
          >
            Start the clock
          </button>
        ) : (
          <button
            type="button"
            className="modebar__btn"
            onClick={() => {
              setStartedAt(null);
              setI(0);
            }}
          >
            Reset
          </button>
        )}
        <button
          type="button"
          className="modebar__btn modebar__btn--hood"
          disabled={i === STEPS.length - 1}
          onClick={() => setI(i + 1)}
        >
          Next
        </button>
        <button type="button" className="modebar__btn" onClick={onClose}>
          Hide (G)
        </button>
      </div>
    </aside>
  );
}
