/**
 * Developer tools for step detection: the 40-step accuracy test and the tuning panel.
 * These live on the hidden Developer screen (Stage 7), never on patient screens, so sliders
 * are fine here even though patient screens avoid drag gestures.
 */
import { useState } from 'react';
import { STEP_SETTING_RANGES, type LegMode, type StepDetectorSettings } from '@footnotes/shared';
import { Button } from '../ui/Button';
import { steps, useSteps } from './steps';

/** "Walk on the spot counting 40 steps aloud, compare with what we detected." */
export function StepTest() {
  const s = useSteps();
  const [counted, setCounted] = useState(40);
  const accuracy = counted > 0 ? (s.count / counted) * 100 : 0;
  const within = Math.abs(s.count - counted) / Math.max(1, counted) <= 0.05;

  return (
    <section className="card tool" aria-labelledby="test-h">
      <h2 id="test-h">40-step test</h2>
      <ol className="tool__steps">
        <li>Tap Reset count.</li>
        <li>Put the phone in your pocket and walk on the spot, counting {counted} steps aloud.</li>
        <li>Take the phone out and compare.</li>
      </ol>
      <div className="tool__row">
        <label htmlFor="counted">Steps you counted</label>
        <input
          id="counted"
          className="tool__number"
          type="number"
          inputMode="numeric"
          min={1}
          value={counted}
          onChange={(e) => setCounted(Math.max(0, Number(e.target.value) || 0))}
        />
      </div>
      <p className="tool__result" aria-live="polite">
        Detected <strong>{s.count}</strong> of {counted} ({accuracy.toFixed(0)}%).{' '}
        {s.count > 0 && (within ? 'Within 5%: on target.' : 'More than 5% off: try tuning below.')}
      </p>
      <Button variant="secondary" onClick={() => steps.resetCount()}>
        Reset count
      </Button>
    </section>
  );
}

type NumericKey = keyof typeof STEP_SETTING_RANGES;

const SLIDERS: { key: NumericKey; label: string; help: string }[] = [
  {
    key: 'thresholdK',
    label: 'Sensitivity (k)',
    help: 'Lower catches softer steps; higher ignores small bumps.',
  },
  {
    key: 'minProminence',
    label: 'Minimum bump',
    help: 'How much a peak must stand out from the dip before it.',
  },
  { key: 'minAmplitude', label: 'Threshold floor', help: 'Stops a still phone counting noise.' },
  {
    key: 'refractoryMs',
    label: 'Shortest gap between steps',
    help: 'Stops one jolt counting twice.',
  },
  { key: 'lowpassHz', label: 'Smoothing cutoff', help: 'Lower is smoother but slightly slower.' },
];

const LEG_MODES: { mode: LegMode; label: string }[] = [
  { mode: 'auto', label: 'Auto' },
  { mode: 'both', label: 'Both legs' },
  { mode: 'one', label: 'One leg' },
];

export function TuningPanel() {
  const s = useSteps();
  const [tick, setTick] = useState(false);

  const set = (patch: Partial<StepDetectorSettings>) => steps.updateSettings(patch);

  return (
    <details className="card tool tuning">
      <summary>Tuning</summary>

      <fieldset className="tool__legs">
        <legend>Which steps does the phone feel?</legend>
        <div className="seg">
          {LEG_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              className="seg__btn"
              aria-pressed={s.settings.legMode === mode}
              onClick={() => set({ legMode: mode })}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="tool__help">
          Auto treats each bump as a full stride (two steps) when bumps are more than about 0.9 s
          apart. Right now: {s.oneLeg ? 'one leg, counting each bump as two steps' : 'both legs'}.
        </p>
      </fieldset>

      {SLIDERS.map(({ key, label, help }) => {
        const r = STEP_SETTING_RANGES[key];
        const value = s.settings[key];
        return (
          <div className="slider" key={key}>
            <label htmlFor={`set-${key}`}>
              {label}{' '}
              <output htmlFor={`set-${key}`}>
                {value}
                {r.unit && ` ${r.unit}`}
              </output>
            </label>
            <input
              id={`set-${key}`}
              type="range"
              min={r.min}
              max={r.max}
              step={r.step}
              value={value}
              onChange={(e) => set({ [key]: Number(e.target.value) })}
            />
            <p className="tool__help">{help}</p>
          </div>
        );
      })}

      <label className="toggle">
        <input
          type="checkbox"
          checked={tick}
          onChange={(e) => {
            setTick(e.target.checked);
            steps.setTick(e.target.checked);
          }}
        />
        Tick sound on every step (tune by ear with the phone in your pocket)
      </label>

      <Button variant="secondary" onClick={() => steps.resetSettings()}>
        Back to default settings
      </Button>
    </details>
  );
}
