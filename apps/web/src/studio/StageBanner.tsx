/**
 * One big line across the top of the Studio saying which stage the walk is in, so anyone
 * watching can tell at a glance: getting ready, measuring the pace (20 s), pace found and
 * waiting for the walker, or the main walk running (with a flash as it starts).
 */
import { useEffect, useRef, useState } from 'react';
import { CALIBRATION_MS } from '@footnotes/shared';
import { useStore } from '../shared/store';
import { audio } from './audio/engine';
import { session } from './session';

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function StageBanner() {
  const s = useStore(session.state);
  const a = useStore(audio.state);
  const [now, setNow] = useState(() => performance.now());
  const startedAt = useRef<number | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  // Note when the main walk starts, and flash the banner for a few seconds.
  useEffect(() => {
    if (a.playing && startedAt.current === null) {
      startedAt.current = performance.now();
      setFlash(true);
      const id = window.setTimeout(() => setFlash(false), 3000);
      return () => window.clearTimeout(id);
    }
    if (!a.playing) startedAt.current = null;
  }, [a.playing]);

  let kind: 'muted' | 'measure' | 'waiting' | 'live';
  let label: string;
  let text: string;

  if (a.playing) {
    kind = 'live';
    label = 'Main walk';
    text = `Running ${mmss(now - (startedAt.current ?? now))} · beat ${s.tempo} BPM${
      s.baseline ? ` (their pace ${Math.round(s.baseline)})` : ''
    }`;
  } else if (s.phase === 'calibrating') {
    kind = 'measure';
    label = 'Step 1 of 2 · Finding their pace';
    const left = CALIBRATION_MS - (now - (s.calStartedAt ?? now));
    text = `${Math.max(0, Math.ceil(left / 1000))} s left · ${s.calStepCount} steps · no music yet`;
  } else if (s.phase === 'ready') {
    kind = 'waiting';
    label = !s.result
      ? 'Beat chosen'
      : s.result.cadenceSpm
        ? 'Pace found'
        : 'No pace measured: using a steady beat';
    text = `${s.baseline ? `${Math.round(s.baseline)} steps/min → ` : ''}beat ${s.tempo} BPM. Waiting for the walker to press “Start the main walk” on the phone (or Start the beat here).`;
  } else {
    kind = 'muted';
    label = a.status === 'on' ? 'Ready' : 'Before you start';
    text =
      a.status === 'on'
        ? 'The walker presses “Start a walk” on the phone, or press Find their pace here.'
        : 'Click Start audio on the right so the laptop can play the beat.';
  }

  return (
    <div
      className={`stage stage--${kind}${flash ? ' stage--flash' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="stage__label">
        {kind === 'live' && <span className="stage__dot" aria-hidden="true" />}
        {flash ? 'Main walk started' : label}
      </span>
      <span className="stage__text">{text}</span>
    </div>
  );
}
