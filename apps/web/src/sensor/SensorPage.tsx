import { useSearchParams } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Wordmark } from '../ui/Logo';
import { IconPlay } from '../ui/icons';
import { motion, type MotionState } from './motion';
import { useMotion } from './useMotion';
import { useWakeLock, wakeLock } from './wakeLock';
import { SERIES, SignalGraph } from './SignalGraph';
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
          <p className="sensor__lead">
            Shake the phone, or walk with it in your pocket, and watch the lines move.
          </p>

          <section className="graph-card" aria-label="Live motion signal">
            <SignalGraph />
            <ul className="legend">
              {SERIES.map((s) => (
                <li key={s.key}>
                  <span
                    className="legend__swatch"
                    style={{ background: s.color, height: s.width + 1 }}
                    aria-hidden="true"
                  />
                  {s.label}
                </li>
              ))}
            </ul>
          </section>

          <dl className="stats">
            <div>
              <dt>Readings a second</dt>
              <dd>{m.rateHz ? Math.round(m.rateHz) : '...'} Hz</dd>
            </div>
            <div>
              <dt>Overall movement</dt>
              <dd>{m.latest ? m.latest.mag.toFixed(1) : '...'}</dd>
            </div>
            <div>
              <dt>Screen</dt>
              <dd style={{ fontSize: 'var(--fs-body-lg)' }}>
                {wake === 'on' ? 'Kept awake' : 'Keep it on'}
              </dd>
            </div>
            <div>
              <dt>Readings so far</dt>
              <dd>{m.total.toLocaleString()}</dd>
            </div>
          </dl>
          <p className="sensor__note">
            Units are m/s² including gravity, so a phone lying still reads about 9.8 overall.
            {m.reportedIntervalMs != null &&
              ` The browser reports one reading every ${formatInterval(m.reportedIntervalMs)}.`}
            {wake !== 'on' &&
              ' This phone did not let us keep the screen on, so please stop it from locking.'}
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
