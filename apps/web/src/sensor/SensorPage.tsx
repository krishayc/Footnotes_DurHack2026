import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Wordmark } from '../ui/Logo';
import { IconPlay } from '../ui/icons';
import { motion, type MotionState } from './motion';
import { useMotion } from './useMotion';
import { useWakeLock, wakeLock } from './wakeLock';
import { RAW_SERIES, STEP_SERIES, SignalGraph, type GraphMode } from './SignalGraph';
import { StepTest, TuningPanel } from './StepTools';
import { useSteps } from './steps';
import { useSensorLink } from './link';
import type { LinkSnapshot } from '../shared/connection';
import { Link } from 'react-router-dom';
import './sensor.css';

// iOS (Safari and every iPhone browser) is the platform that has requestPermission().
const isIOS =
  typeof (window.DeviceMotionEvent as unknown as { requestPermission?: unknown } | undefined)
    ?.requestPermission === 'function';

/**
 * Stage 1 sensor page: start the motion sensor, keep the screen awake, show the live signal.
 *
 * In Stage 7 this becomes the hidden "Developer" screen and the patient flow (Home, Step 1,
 * Walking, ...) takes over the /sensor route.
 */
export function SensorPage() {
  const [params] = useSearchParams();
  const room = params.get('room');
  const m = useMotion();
  const wake = useWakeLock();
  const link = useSensorLink(room);
  const [graph, setGraph] = useState<GraphMode>('steps');

  const active = m.state === 'running' || m.state === 'waiting' || m.state === 'requesting';

  // Both calls happen synchronously inside the tap, which iOS requires.
  function start() {
    motion.start();
    wakeLock.enable();
  }
  function stop() {
    motion.stop();
    wakeLock.disable();
  }

  return (
    <main className="sensor fade-in">
      <div className="sensor__top">
        <Wordmark size={36} />
        {room && <span className="pill sensor__room">Room {room}</span>}
      </div>

      <LinkLine room={room} link={link} />

      {m.state === 'idle' && (
        <>
          <section className="sensor__intro">
            <h1>Let's wake up the sensor.</h1>
            <p className="sensor__lead">
              Footnotes feels your steps through the phone's motion sensor. Tap below, and if your
              phone asks, choose Allow.
            </p>
          </section>
          <Button hero onClick={start}>
            <span className="btn__disc">
              <IconPlay />
            </span>
            <span className="btn__text">
              <span className="btn__title">Start sensor</span>
              <span className="btn__sub">Your phone may ask once</span>
            </span>
          </Button>
        </>
      )}

      {(m.state === 'requesting' || m.state === 'waiting') && (
        <p className="sensor__status sensor__status--wait" role="status">
          <span className="dot" aria-hidden="true" />
          {m.state === 'requesting'
            ? 'Waiting for your answer on the pop-up...'
            : 'Listening for movement...'}
        </p>
      )}

      <Help state={m.state} onRetry={start} />

      {m.state === 'running' && (
        <>
          <p className="sensor__status sensor__status--on" role="status">
            <span className="dot" aria-hidden="true" />
            Sensor is on
          </p>

          <StepCounter />

          <section className="graph-card" aria-label="Live motion signal">
            <div className="seg seg--dark" role="group" aria-label="Graph view">
              {(['steps', 'raw'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  className="seg__btn"
                  aria-pressed={graph === g}
                  onClick={() => setGraph(g)}
                >
                  {g === 'steps' ? 'Steps' : 'Raw sensor'}
                </button>
              ))}
            </div>
            <SignalGraph mode={graph} />
            <ul className="legend">
              {(graph === 'steps' ? STEP_SERIES : RAW_SERIES).map((s) => (
                <li key={s.key}>
                  {s.key === 'step' ? (
                    <span className="legend__dot" aria-hidden="true" />
                  ) : (
                    <span
                      className={`legend__swatch${s.dash ? ' legend__swatch--dash' : ''}`}
                      style={{
                        background: s.dash ? undefined : s.color,
                        color: s.color,
                        height: s.width + 1,
                      }}
                      aria-hidden="true"
                    />
                  )}
                  {s.label}
                </li>
              ))}
            </ul>
          </section>

          <StepTest />
          <TuningPanel />

          <dl className="stats">
            <div>
              <dt>Readings a second</dt>
              <dd>{m.rateHz ? Math.round(m.rateHz) : '...'} Hz</dd>
            </div>
            <div>
              <dt>Screen</dt>
              <dd style={{ fontSize: 'var(--fs-body-lg)' }}>
                {wake === 'on' ? 'Kept awake' : 'Keep it on'}
              </dd>
            </div>
          </dl>
          <p className="sensor__note">
            {m.reportedIntervalMs != null &&
              `The browser reports one reading every ${formatInterval(m.reportedIntervalMs)}. `}
            {wake !== 'on' &&
              'This phone did not let us keep the screen on, so please stop it from locking.'}
          </p>
        </>
      )}

      {active && (
        <Button variant="secondary" onClick={stop}>
          Stop sensor
        </Button>
      )}
    </main>
  );
}

/** One calm line about the laptop connection. Shape (dot) + words, never colour alone. */
function LinkLine({ room, link }: { room: string | null; link: LinkSnapshot | null }) {
  if (!room) {
    return (
      <p className="link-line link-line--off">
        <span className="dot" aria-hidden="true" />
        <span>
          Not linked to a laptop. <Link to="/">Enter a room code</Link>
        </span>
      </p>
    );
  }
  if (!link) return null;
  let text: string;
  let tone: 'on' | 'wait' | 'off';
  if (link.status === 'error') {
    text = link.error ?? 'Something went wrong with the room code.';
    tone = 'off';
  } else if (link.status === 'reconnecting') {
    text = 'We lost the laptop connection. Trying again...';
    tone = 'wait';
  } else if (link.status === 'connecting') {
    text = 'Connecting...';
    tone = 'wait';
  } else if (!link.peerConnected) {
    text = 'Connected. Waiting for the laptop to open the Studio...';
    tone = 'wait';
  } else {
    text = 'Linked to the laptop';
    tone = 'on';
  }
  return (
    <p className={`link-line link-line--${tone}`} role="status">
      <span className="dot" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

/** Big live step count and pace. Pace hides itself if no step for 3 s (they stopped). */
function StepCounter() {
  const s = useSteps();
  useMotion(); // re-render a few times a second so "stopped" shows promptly
  const fresh = s.lastStepAt !== null && performance.now() - s.lastStepAt < 3000;
  return (
    <section className="counter" aria-live="polite" aria-label="Step count">
      <div>
        <p className="counter__label">Steps</p>
        <p className="counter__value">{s.count}</p>
      </div>
      <div>
        <p className="counter__label">Pace</p>
        <p className="counter__value counter__value--sm">
          {fresh && s.cadenceSpm ? Math.round(s.cadenceSpm) : '-'}
        </p>
        <p className="counter__unit">steps a minute</p>
      </div>
      {s.oneLeg && (
        <p className="counter__note">Feeling one leg, so each bump counts as two steps.</p>
      )}
    </section>
  );
}

/** iOS has historically reported `interval` in seconds, Android in ms. Show it sensibly. */
function formatInterval(v: number) {
  const ms = v < 1 ? v * 1000 : v;
  return `${Math.round(ms)} ms`;
}

/** Kind, specific help for each way starting the sensor can go wrong. */
function Help({ state, onRetry }: { state: MotionState; onRetry: () => void }) {
  let title: string;
  let body: React.ReactNode;
  switch (state) {
    case 'denied':
      title = 'Motion access is turned off';
      body = isIOS ? (
        <ol>
          <li>Close Safari completely (swipe it away in the app switcher).</li>
          <li>Open this page again.</li>
          <li>Tap Start sensor, then choose Allow.</li>
        </ol>
      ) : (
        <p>
          Open your browser's site settings for this page, allow Motion sensors, then try again.
        </p>
      );
      break;
    case 'insecure':
      title = 'This page needs a secure link';
      body = (
        <p>
          Phones only share motion readings with pages that start with https://. Open the https link
          shown on the laptop instead.
        </p>
      );
      break;
    case 'unsupported':
      title = "This browser can't read motion";
      body = <p>Please try Chrome on Android, or Safari on iPhone.</p>;
      break;
    case 'no-data':
      title = "We're not getting any readings yet";
      body = isIOS ? (
        <p>
          On iPhone, check Settings, then Safari, and make sure Motion and Orientation Access is on.
          Then try again.
        </p>
      ) : (
        <p>
          This is normal on a laptop, which has no motion sensor. On a phone, check that motion
          sensors are allowed for this site, then try again.
        </p>
      );
      break;
    default:
      return null;
  }
  return (
    <section className="card sensor__help" role="alert">
      <h2>{title}</h2>
      {body}
      {state !== 'unsupported' && state !== 'insecure' && (
        <Button
          onClick={() => {
            motion.stop();
            onRetry();
          }}
        >
          Try again
        </Button>
      )}
    </section>
  );
}
