/**
 * Bottom bar: where steps come from. Live phone is the real thing; Tap mode and Simulated
 * walker are the demo fallbacks.
 */
import { useEffect } from 'react';
import { Button } from '../ui/Button';
import { useStore } from '../shared/store';
import { stepBus, type StepMode } from './steps';

const MODES: { mode: StepMode; label: string }[] = [
  { mode: 'live', label: 'Live phone' },
  { mode: 'tap', label: 'Tap mode' },
  { mode: 'sim', label: 'Simulated walker' },
];

export function ModeBar() {
  const { mode } = useStore(stepBus.settings);
  return (
    <nav className="modebar" aria-label="Where the steps come from">
      {MODES.map((m) => (
        <button
          key={m.mode}
          type="button"
          className="modebar__btn"
          aria-pressed={mode === m.mode}
          onClick={() => stepBus.setMode(m.mode)}
        >
          {m.label}
        </button>
      ))}
    </nav>
  );
}

/** Tap mode: the big button or the spacebar counts as a step. */
export function TapPad() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, button:not(.tappad)')) return; // don't hijack controls
      e.preventDefault();
      stepBus.tap(e.timeStamp);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section className="panel" aria-labelledby="tap-h">
      <h2 id="tap-h" className="panel__h">
        Tap mode
      </h2>
      <p className="panel__p">Press the spacebar, or tap the pad, once for every step.</p>
      <button
        type="button"
        className="tappad"
        // pointerdown, not click: fires the moment the finger lands, like a foot.
        onPointerDown={(e) => stepBus.tap(e.timeStamp)}
      >
        Tap for a step
      </button>
    </section>
  );
}

/** Simulated walker controls. */
export function SimControls() {
  const s = useStore(stepBus.settings);
  return (
    <section className="panel" aria-labelledby="sim-h">
      <h2 id="sim-h" className="panel__h">
        Simulated walker
      </h2>
      <div className="slider slider--dark">
        <label htmlFor="sim-spm">
          Pace <output htmlFor="sim-spm">{s.simSpm} steps/min</output>
        </label>
        <input
          id="sim-spm"
          type="range"
          min={60}
          max={140}
          step={1}
          value={s.simSpm}
          onChange={(e) => stepBus.settings.set({ simSpm: Number(e.target.value) })}
        />
      </div>
      <div className="slider slider--dark">
        <label htmlFor="sim-jit">
          Unevenness <output htmlFor="sim-jit">±{Math.round(s.simJitter * 100)}%</output>
        </label>
        <input
          id="sim-jit"
          type="range"
          min={0}
          max={20}
          step={1}
          value={Math.round(s.simJitter * 100)}
          onChange={(e) => stepBus.settings.set({ simJitter: Number(e.target.value) / 100 })}
        />
      </div>
      <Button
        variant="secondary"
        onClick={() => stepBus.settings.set({ simSpm: 100, simJitter: 0.04 })}
      >
        Reset walker
      </Button>
    </section>
  );
}
