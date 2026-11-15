/**
 * The Studio's main controls: turn on sound, find the walker's pace, start the steady beat.
 */
import { useEffect, useState } from 'react';
import { CALIBRATION_MS, FALLBACK_TEMPO, OFFSET_MAX, OFFSET_MIN } from '@footnotes/shared';
import { Button } from '../ui/Button';
import { useStore } from '../shared/store';
import { audio } from './audio/engine';
import { session } from './session';

export function ControlPanel() {
  const a = useStore(audio.state);
  const s = useStore(session.state);

  if (a.status !== 'on') {
    return (
      <section className="panel" aria-labelledby="sound-h">
        <h2 id="sound-h" className="panel__h">
          Turn on the sound
        </h2>
        <p className="panel__p">
          Browsers keep pages silent until you click. Use the laptop speakers or wired speakers
          (Bluetooth adds a delay that would throw the timing off).
        </p>
        <Button
          variant="highlight"
          onClick={() => void audio.start()}
          disabled={a.status === 'starting'}
        >
          {a.status === 'starting' ? 'Starting sound...' : 'Start audio'}
        </Button>
        {a.status === 'blocked' && (
          <p className="panel__warn" role="alert">
            The browser didn't allow sound. Click Start audio again.
          </p>
        )}
      </section>
    );
  }

  if (s.phase === 'calibrating')
    return <Calibrating startedAt={s.calStartedAt ?? 0} steps={s.calStepCount} />;

  if (s.phase === 'idle') {
    return (
      <section className="panel" aria-labelledby="pace-h">
        <h2 id="pace-h" className="panel__h">
          Find their pace
        </h2>
        <p className="panel__p">
          The walker walks the way they normally do for 20 seconds, with no music. We measure their
          steps a minute and set the beat just above it.
        </p>
        <Button variant="highlight" onClick={() => session.startCalibration()}>
          Find their pace
        </Button>
        <Button variant="secondary" onClick={() => session.useFixedTempo(FALLBACK_TEMPO)}>
          Skip: use {FALLBACK_TEMPO} beats a minute
        </Button>
      </section>
    );
  }

  // Ready.
  const r = s.result;
  return (
    <section className="panel" aria-labelledby="beat-h">
      <h2 id="beat-h" className="panel__h">
        The beat
      </h2>
      <div className="beatline">
        <div>
          <p className="beatline__label">Their pace</p>
          <p className="beatline__value">
            {s.baseline ? Math.round(s.baseline) : '-'}
            <span> steps/min</span>
          </p>
        </div>
        <div>
          <p className="beatline__label">
            Beat {s.manual ? '(set by hand)' : `(+${Math.round(s.offset * 100)}%)`}
          </p>
          <p className="beatline__value beatline__value--hi">
            {s.tempo}
            <span> BPM</span>
          </p>
        </div>
      </div>
      {r && r.notes.length > 0 && (
        <ul className="panel__notes">
          {r.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {a.playing ? (
        <Button variant="secondary" onClick={() => session.stopBeat()}>
          Stop the beat
        </Button>
      ) : (
        <Button variant="highlight" onClick={() => session.startBeat()}>
          Start the beat
        </Button>
      )}

      <div className="pair">
        <Button variant="secondary" onClick={() => session.nudgeTempo(-2)}>
          A bit slower
        </Button>
        <Button variant="secondary" onClick={() => session.nudgeTempo(2)}>
          A bit faster
        </Button>
      </div>

      <div className="slider slider--dark">
        <label htmlFor="offset">
          Beat above their pace <output htmlFor="offset">+{Math.round(s.offset * 100)}%</output>
        </label>
        <input
          id="offset"
          type="range"
          min={OFFSET_MIN * 100}
          max={OFFSET_MAX * 100}
          step={1}
          value={Math.round(s.offset * 100)}
          onChange={(e) => session.setOffset(Number(e.target.value) / 100)}
        />
      </div>

      <div className="slider slider--dark">
        <label htmlFor="vol">
          Volume <output htmlFor="vol">{a.volumeDb} dB</output>
        </label>
        <input
          id="vol"
          type="range"
          min={-30}
          max={0}
          step={1}
          value={a.volumeDb}
          onChange={(e) => audio.setVolume(Number(e.target.value))}
        />
      </div>

      <Button variant="secondary" onClick={() => session.startCalibration()}>
        Find their pace again
      </Button>
    </section>
  );
}

/** Calibration progress: a calm ring with the seconds left and the steps counted. */
function Calibrating({ startedAt, steps }: { startedAt: number; steps: number }) {
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = Math.min(CALIBRATION_MS, now - startedAt);
  const left = Math.ceil((CALIBRATION_MS - elapsed) / 1000);
  const frac = elapsed / CALIBRATION_MS;
  const R = 70;
  const C = 2 * Math.PI * R;

  return (
    <section className="panel panel--center" aria-labelledby="cal-h">
      <h2 id="cal-h" className="panel__h">
        Finding their pace
      </h2>
      <div className="ring" role="timer" aria-live="off" aria-label={`${left} seconds left`}>
        <svg width="180" height="180" viewBox="0 0 180 180" aria-hidden="true">
          <circle
            cx="90"
            cy="90"
            r={R}
            stroke="var(--d-border-strong)"
            strokeWidth="10"
            fill="none"
          />
          <circle
            cx="90"
            cy="90"
            r={R}
            stroke="var(--c-highlight)"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - frac)}
            transform="rotate(-90 90 90)"
          />
        </svg>
        <div className="ring__text">
          <span className="ring__num">{left}</span>
          <span className="ring__unit">seconds left</span>
        </div>
      </div>
      <p className="panel__p" aria-live="polite">
        {steps} steps counted. No music yet: just walk naturally.
      </p>
      <Button variant="secondary" onClick={() => session.cancelCalibration()}>
        Cancel
      </Button>
    </section>
  );
}
