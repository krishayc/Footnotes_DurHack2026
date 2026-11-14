/**
 * Pocket mode: the screen while the phone is in a pocket.
 *
 * - One calm dark screen with just what matters: linked to the laptop? sensor on? steps.
 * - Every tap and pocket bump is ignored. The only way out is to press and hold anywhere for
 *   2 seconds (a ring fills up as you hold). Holding is easier than precise tapping with a
 *   tremor, and a whole-screen target means slipping doesn't matter.
 * - Holding opens the details screen (where Stop sensor lives); the sensor keeps running.
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { LinkSnapshot } from '../shared/connection';
import { useMotion } from './useMotion';
import { useSteps } from './steps';
import { useWakeLock } from './wakeLock';

const HOLD_MS = 2000;

export function PocketScreen({
  room,
  link,
  onExit,
}: {
  room: string | null;
  link: LinkSnapshot | null;
  onExit: () => void;
}) {
  const m = useMotion();
  const s = useSteps();
  const wake = useWakeLock();
  const [hold, setHold] = useState(0); // 0..1
  const holdStart = useRef<number | null>(null);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const begin = (e: PointerEvent) => {
    e.preventDefault();
    holdStart.current = performance.now();
    const tick = () => {
      if (holdStart.current === null) return;
      const p = Math.min(1, (performance.now() - holdStart.current) / HOLD_MS);
      setHold(p);
      if (p >= 1) {
        holdStart.current = null;
        if ('vibrate' in navigator) navigator.vibrate?.(30);
        onExit();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  const end = () => {
    holdStart.current = null;
    cancelAnimationFrame(raf.current);
    setHold(0);
  };

  const linked = link?.status === 'connected' && link.peerConnected;
  const linkText = !room
    ? 'Not linked to a laptop'
    : linked
      ? 'Linked to the laptop'
      : link?.status === 'connected'
        ? 'Waiting for the laptop'
        : 'Reconnecting to the laptop...';
  const sensing = m.state === 'running' && m.quietMs < 1000;
  const fresh = s.lastStepAt !== null && performance.now() - s.lastStepAt < 3000;

  const R = 46;
  const C = 2 * Math.PI * R;

  return (
    <div
      className="pocket"
      onPointerDown={begin}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
      onContextMenu={(e) => e.preventDefault()}
      role="application"
      aria-label="Pocket mode. Press and hold anywhere for 2 seconds to leave."
    >
      <div className="pocket__rows" aria-live="polite">
        <Row ok={!!linked} text={linkText} />
        <Row ok={sensing} text={sensing ? 'Feeling your steps' : 'Waking the sensor...'} />
        {wake !== 'on' && <Row ok={false} text="Keep the screen on" />}
      </div>

      <div className="pocket__count">
        <p className="pocket__num">{s.count}</p>
        <p className="pocket__label">steps</p>
        <p className="pocket__pace">
          {fresh && s.cadenceSpm ? `${Math.round(s.cadenceSpm)} steps a minute` : 'Start walking'}
        </p>
      </div>

      <div className="pocket__hold">
        <svg width="110" height="110" viewBox="0 0 110 110" aria-hidden="true">
          <circle cx="55" cy="55" r={R} stroke="#2F4840" strokeWidth="8" fill="none" />
          <circle
            cx="55"
            cy="55"
            r={R}
            stroke="#F2B544"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - hold)}
            transform="rotate(-90 55 55)"
          />
        </svg>
        <p className="pocket__holdtext">
          {hold > 0 ? 'Keep holding...' : 'Press and hold anywhere to see details'}
        </p>
        <p className="pocket__hint">Quick taps and pocket bumps are ignored</p>
      </div>
    </div>
  );
}

function Row({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p className={`pocket__row ${ok ? 'is-ok' : 'is-wait'}`}>
      <span className="pocket__icon" aria-hidden="true">
        {ok ? (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        ) : (
          <span className="pocket__dot" />
        )}
      </span>
      {text}
    </p>
  );
}
