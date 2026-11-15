/**
 * Demo guide (press G): a presenter's cue card for the 3-minute judge script, one step at a
 * time, with a running clock, what to say, what to do, and a button for each step's action
 * (and its fallback). It only drives the same controls a person could press.
 */
import { useEffect, useState } from 'react';
import { useStore } from '../shared/store';
import { audio } from './audio/engine';
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
        stepBus.settings.set({ simFollow: false, simSpm: 78 });
      },
    },
  },
  {
    from: 135,
    to: 180,
    title: 'How it works',
    say: 'Under the music: the phone detects each step, the laptop and phone clocks are synced to the millisecond, and a score from circular statistics decides how many instruments play. The beat never chases you: only the music around it changes.',
    doText: 'Hand back to the judges for questions.',
  },
];

export function DemoGuide({ onClose }: { onClose: () => void }) {
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
  const action = i === 0 && a.status === 'on' ? undefined : s.action;

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
