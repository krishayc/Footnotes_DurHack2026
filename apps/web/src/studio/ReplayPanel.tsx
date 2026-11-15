/**
 * Replay a real freeze (Daphnet): choose a recording and a sensor, play it, and watch the
 * timeline: the physiotherapists' marked freeze (top) against what our detector flagged
 * (bottom), with a playhead.
 */
import { useEffect } from 'react';
import { DAPHNET_RESULTS } from '@footnotes/shared';
import { Button } from '../ui/Button';
import { useStore } from '../shared/store';
import { audio } from './audio/engine';
import { SENSOR_LABEL, type FreezeSensor } from './freeze';
import { replay } from './replay';

export function ReplayPanel() {
  const r = useStore(replay.state);
  const a = useStore(audio.state);
  useEffect(() => void replay.loadIndex(), []);
  const pct = (s: number) => `${(100 * s) / Math.max(1, r.durationS)}%`;
  const clip = r.clips.find((c) => c.id === r.clipId);
  const res = DAPHNET_RESULTS[r.sensor];

  return (
    <section className="panel" aria-labelledby="rp-h">
      <h2 id="rp-h" className="panel__h">
        Replay a real freeze
      </h2>
      <p className="panel__p panel__p--sm">
        Real recordings of people with Parkinson&apos;s (Daphnet dataset, CC BY 4.0), played through
        the same pipeline as the phone.
      </p>
      <label className="field">
        <span>Recording</span>
        <select
          value={r.clipId ?? ''}
          onChange={(e) => replay.select(e.target.value)}
          className="select"
        >
          {r.clips.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <div className="seg seg--dark" role="group" aria-label="Which sensor the freeze index uses">
        {(['ankle', 'thigh', 'trunk'] as FreezeSensor[]).map((s) => (
          <button
            key={s}
            type="button"
            className="seg__btn"
            aria-pressed={r.sensor === s}
            onClick={() => replay.setSensor(s)}
          >
            {SENSOR_LABEL[s]}
          </button>
        ))}
      </div>
      <p className="panel__p panel__p--sm">
        {SENSOR_LABEL[r.sensor]} sensor on all {DAPHNET_RESULTS.episodes} Daphnet freezes (fair
        test): {Math.round(res.windowSensitivity * 100)}% sensitivity,{' '}
        {Math.round(res.windowSpecificity * 100)}% specificity, {res.falseAlarmsPerHour} false
        alarms an hour.
      </p>

      {r.durationS > 0 && (
        <div className="timeline" aria-label="Annotated freeze versus detected freeze">
          <div className="timeline__row">
            <span className="timeline__label">Marked by physios</span>
            <div className="timeline__track">
              {r.freezes.map(([s, e], i) => (
                <span
                  key={i}
                  className="timeline__band timeline__band--truth"
                  style={{ left: pct(s), width: pct(e - s) }}
                />
              ))}
              <span className="timeline__head" style={{ left: pct(r.pos) }} />
            </div>
          </div>
          <div className="timeline__row">
            <span className="timeline__label">Our detector</span>
            <div className="timeline__track">
              {r.detections.map(([s, e], i) => (
                <span
                  key={i}
                  className="timeline__band timeline__band--det"
                  style={{ left: pct(s), width: pct(Math.max(0.3, e - s)) }}
                />
              ))}
              <span className="timeline__head" style={{ left: pct(r.pos) }} />
            </div>
          </div>
          <p className="timeline__time">
            {Math.floor(r.pos)} s of {Math.round(r.durationS)} s · {r.stepsFound} steps found
          </p>
        </div>
      )}

      {r.error && (
        <p className="panel__warn" role="alert">
          {r.error}
        </p>
      )}
      {a.status !== 'on' && (
        <p className="panel__warn">Start audio first to hear the recovery motif.</p>
      )}
      {r.status === 'playing' || r.status === 'loading' ? (
        <Button variant="secondary" onClick={() => replay.stop()}>
          Stop replay
        </Button>
      ) : (
        <Button variant="highlight" onClick={() => void replay.play()} disabled={!clip}>
          {r.status === 'done' ? 'Play again' : 'Play the recording'}
        </Button>
      )}
      <p className="panel__p panel__p--sm">
        In a replay the music follows whether the patient is walking: they could not hear our beat,
        so “in step” doesn&apos;t apply.
      </p>
    </section>
  );
}
