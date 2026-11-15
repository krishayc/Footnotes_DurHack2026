/** First-run walkthrough, Home, Step 1 (find your pace), Step 2 (your beat is ready). */
import { useEffect, useRef, useState } from 'react';
import { CALIBRATION_MS } from '@footnotes/shared';
import { Button } from '../ui/Button';
import { IconPlay } from '../ui/icons';
import { useStore } from '../shared/store';
import type { LinkSnapshot } from '../shared/connection';
import { motion } from '../sensor/motion';
import { wakeLock } from '../sensor/wakeLock';
import { buzz } from '../shared/haptic';
import { ScreenWarning } from './ScreenWarning';
import { sendWalkCommand, walk } from '../sensor/link';
import { useSteps } from '../sensor/steps';
import { walks, dayLabel, walkLine } from './history';
import { prefs } from './prefs';
import { StaffPicture } from './StaffPicture';
import { IconFoot, IconGear, IconList, Screen } from './ui';
import { chime, speak, unlockAudio } from './voice';

export type Go = (screen: string, arg?: string) => void;

/** Plain words for why the phone isn't linked to the laptop yet (null when it is). */
export function linkProblem(link: LinkSnapshot | null): string | null {
  const room = new URLSearchParams(location.search).get('room');
  if (link === null || !room)
    return 'Not connected to the music yet. Scan the code on the laptop with your camera.';
  if (link.status === 'error') return link.error ?? 'Connection problem. Reload this page.';
  if (link.status !== 'connected')
    return `Connecting to the laptop...${link.attempts > 2 ? ` (try ${link.attempts}: check the laptop and the tunnel are still running)` : ''}`;
  if (!link.peerConnected)
    return `Waiting for the laptop in room ${room}. If the laptop shows a different room code, scan its code again.`;
  return null;
}

/** Start the motion sensor and keep the screen awake. Must run inside a tap (iOS). */
export function startSensing() {
  unlockAudio();
  motion.start();
  wakeLock.enable();
}

// ---------------------------------------------------------------- Welcome (first run)

const CARDS = [
  {
    title: 'A steady beat to walk to',
    text: 'Footnotes plays a calm, steady beat, set just a little quicker than your natural pace. Walking to a beat can help your steps feel more even.',
  },
  {
    title: 'Music that grows with you',
    text: 'When your steps fall in time with the beat, music joins in: shakers, bass, piano and a melody. If you drift, it goes back to a simple beat so it is easy to find again.',
  },
  {
    title: 'Phone in your pocket',
    text: 'Put the phone in a front pocket. Taps and bumps are ignored while you walk. To stop, press and hold anywhere on the screen.',
  },
];

export function Welcome({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const c = CARDS[i];
  const last = i === CARDS.length - 1;
  return (
    <Screen speech={`${c.title}. ${c.text}`}>
      <section className="pt__intro">
        <p className="pt__crumb">
          {i + 1} of {CARDS.length}
        </p>
        <h1>{c.title}</h1>
        <p className="pt__lead">{c.text}</p>
      </section>
      <div className="pt__dots" aria-hidden="true">
        {CARDS.map((_, k) => (
          <span key={k} className={k === i ? 'is-on' : ''} />
        ))}
      </div>
      <div className="pt__actions">
        <Button
          onClick={() => {
            if (last) {
              prefs.set({ welcomed: true });
              onDone();
            } else setI(i + 1);
          }}
        >
          {last ? 'Get started' : 'Next'}
        </Button>
        {i > 0 && (
          <Button variant="secondary" onClick={() => setI(i - 1)}>
            Back
          </Button>
        )}
      </div>
    </Screen>
  );
}

// ---------------------------------------------------------------- Home

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning.' : h < 18 ? 'Good afternoon.' : 'Good evening.';
}

export function Home({ go, link }: { go: Go; link: LinkSnapshot | null }) {
  const { list } = useStore(walks);
  const last = list[0];
  const linked = link?.status === 'connected' && link.peerConnected;
  const speech = `${greeting()} Ready for a walk? Pop your earphones in first. ${
    last ? `Your last walk: ${dayLabel(last.startedAt)}. ${walkLine(last)}` : ''
  }`;

  return (
    <Screen speech={speech}>
      <section className="pt__intro">
        <h1>
          Good <span className="scribble">{greeting().slice(5, -1)}</span>.
        </h1>
        <p className="pt__lead">Ready for a walk? Pop your earphones in first.</p>
      </section>

      <Button
        hero
        onClick={() => {
          startSensing();
          go('step1');
        }}
      >
        <span className="btn__disc">
          <IconPlay />
        </span>
        <span className="btn__text">
          <span className="btn__title">Start a walk</span>
          <span className="btn__sub">Takes 20 seconds to set up</span>
        </span>
      </Button>

      {!linked && (
        <p className="pt__note" role="status">
          {linkProblem(link)}
        </p>
      )}

      {last ? (
        <button type="button" className="card pt__last" onClick={() => go('after', last.id)}>
          <span className="pt__lastlabel">Last walk · {dayLabel(last.startedAt)}</span>
          <span className="pt__staff">
            <StaffPicture
              points={last.points}
              dark={false}
              height={70}
              label="Your last walk as music"
            />
          </span>
          <span className="pt__lastline">{walkLine(last)}</span>
        </button>
      ) : (
        <div className="card pt__last">
          <span className="pt__lastlabel">Your first walk</span>
          <span className="pt__lastline">
            After each walk you&apos;ll see it drawn as a little piece of music here.
          </span>
        </div>
      )}

      <div className="pt__pair">
        <Button variant="secondary" onClick={() => go('history')}>
          <IconList /> My walks
        </Button>
        <Button variant="secondary" onClick={() => go('settings')}>
          <IconGear /> Settings
        </Button>
      </div>
    </Screen>
  );
}

// ---------------------------------------------------------------- Step 1: find your pace

type Step1Phase = 'intro' | 'countin' | 'measuring';

export function Step1({ go, link }: { go: Go; link: LinkSnapshot | null }) {
  const ws = useStore(walk);
  const st = ws.state;
  const s = useSteps();
  const [phase, setPhase] = useState<Step1Phase>('intro');
  const [count, setCount] = useState(3);
  /** The laptop never confirmed it started counting (after several tries). */
  const [stuck, setStuck] = useState(false);
  const [, tick] = useState(0);
  const timers = useRef<number[]>([]);
  const linked = link?.status === 'connected' && link.peerConnected;

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  // A gentle 3-second count-in so the phone can go into the pocket first.
  const begin = () => {
    startSensing();
    clearTimers();
    setPhase('countin');
    setCount(3);
    speak('Three');
    [2, 1].forEach((n, k) =>
      timers.current.push(
        window.setTimeout(
          () => {
            setCount(n);
            speak(n === 2 ? 'Two' : 'One');
          },
          (k + 1) * 1000,
        ),
      ),
    );
    timers.current.push(
      window.setTimeout(() => {
        speak('Walk the way you normally do.');
        sendWalkCommand('calibrate');
        setPhase('measuring');
      }, 3000),
    );
  };

  // Someone pressed "Find their pace" on the laptop instead: follow it, so the phone shows
  // the same countdown and moves on to Step 2 at the end.
  useEffect(() => {
    if (st?.phase === 'calibrating' && (phase === 'intro' || phase === 'countin')) {
      clearTimers();
      startSensing();
      speak('Walk the way you normally do.');
      setPhase('measuring');
    }
  }, [st?.phase, phase]);

  // The laptop does the counting. Until it confirms it has started, keep asking (a message
  // sent while the connection was blinking would otherwise be lost, leaving the ring stuck
  // at 20). After 8 s without an answer, say so plainly.
  const laptopCounting = st?.phase === 'calibrating';
  useEffect(() => {
    if (phase !== 'measuring' || laptopCounting) {
      setStuck(false);
      return;
    }
    const startedAt = performance.now();
    const id = window.setInterval(() => {
      if (performance.now() - startedAt > 8000) {
        setStuck(true);
        window.clearInterval(id);
        return;
      }
      sendWalkCommand('calibrate');
    }, 1500);
    return () => window.clearInterval(id);
  }, [phase, laptopCounting]);

  // When the laptop says calibration is done: chime, say so, then show Step 2.
  const wasCalibrating = useRef(false);
  useEffect(() => {
    if (st?.phase === 'calibrating') wasCalibrating.current = true;
    if (phase === 'measuring' && wasCalibrating.current && st?.phase === 'ready') {
      wasCalibrating.current = false;
      // Make the end impossible to miss, with the phone still in the pocket:
      // a long buzz (Android), a chime, and a spoken instruction.
      buzz([400, 150, 400]);
      chime();
      speak('Done. You can stop walking. Take your phone out to start the main walk.');
      go('step2');
    }
  }, [st?.phase, phase, go]);

  // Smooth countdown between laptop updates.
  useEffect(() => {
    if (phase !== 'measuring') return;
    const id = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [phase]);

  const back = () => {
    clearTimers();
    sendWalkCommand('cancelCalibration');
    go('home');
  };

  const leftMs =
    st?.phase === 'calibrating' && st.calLeftMs !== null
      ? Math.max(0, st.calLeftMs - (performance.now() - ws.receivedAt))
      : CALIBRATION_MS;
  const secs = Math.ceil(leftMs / 1000);
  const frac = 1 - leftMs / CALIBRATION_MS;
  const steps = st?.phase === 'calibrating' ? st.calSteps : 0;
  const R = 110;
  const C = 2 * Math.PI * R;

  const speech =
    phase === 'measuring'
      ? `${secs} seconds left. ${steps} steps counted so far. No music yet, just walk naturally. You'll hear a soft chime when we're done.`
      : "Let's find your pace. Put the phone in your pocket and walk the way you normally do. We'll tell you when to stop. Press I'm ready to begin.";

  return (
    <Screen speech={speech} onBack={back} crumb="Step 1 of 2">
      <section className="pt__intro">
        <h1>Let&apos;s find your pace</h1>
        <p className="pt__lead">
          Put the phone in your pocket and walk the way you normally do. We&apos;ll tell you when to
          stop.
        </p>
      </section>

      {phase === 'intro' && (
        <>
          {!linked && (
            <p className="pt__note" role="status">
              {linkProblem(link)}
            </p>
          )}
          <Button hero onClick={begin} disabled={!linked}>
            <span className="btn__disc">
              <IconPlay />
            </span>
            <span className="btn__text">
              <span className="btn__title">I&apos;m ready</span>
              <span className="btn__sub">We&apos;ll count you in: 3, 2, 1</span>
            </span>
          </Button>
        </>
      )}

      {phase === 'countin' && (
        <div className="pt__ringwrap" aria-live="assertive">
          <p className="pt__countin">{count}</p>
          <p className="pt__lead">Phone in your pocket</p>
        </div>
      )}

      {phase === 'measuring' && (
        <>
          <div className="pt__ringwrap" role="timer" aria-label={`${secs} seconds left`}>
            <svg width="260" height="260" viewBox="0 0 260 260" aria-hidden="true">
              <circle cx="130" cy="130" r={R} stroke="#DCE7E1" strokeWidth="16" fill="none" />
              <circle
                cx="130"
                cy="130"
                r={R}
                stroke="#1E5A4C"
                strokeWidth="16"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - frac)}
                transform="rotate(-90 130 130)"
                className="pt__ringarc"
              />
            </svg>
            <div className="pt__ringtext">
              {laptopCounting ? (
                <>
                  <span className="pt__ringnum">{secs}</span>
                  <span>seconds left</span>
                </>
              ) : (
                <span>Starting on the laptop...</span>
              )}
            </div>
          </div>
          <ScreenWarning />
          {!stuck && laptopCounting && linkProblem(link) && (
            <p className="pt__note pt__warn" role="status">
              {link?.status === 'error'
                ? linkProblem(link)
                : 'Lost the laptop for a moment. Keep walking: your steps are saved and will be sent when it reconnects.'}
            </p>
          )}
          {stuck && (
            <p className="pt__note pt__warn" role="alert">
              {linkProblem(link) ??
                'The laptop has not started counting. Check the laptop page is open, then press Start again.'}
            </p>
          )}
          <div className="card pt__stepcard">
            <span className="pt__footicon">
              <IconFoot />
            </span>
            <p>
              <strong>{steps || s.count} steps</strong> counted so far. No music yet, just walk
              naturally.
            </p>
          </div>
          <p className="pt__note">You&apos;ll hear a soft chime when we&apos;re done.</p>
          <Button variant="secondary" onClick={begin}>
            Start again
          </Button>
        </>
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------- Step 2: your beat

/**
 * Ask the laptop to start the beat ONCE, when this screen is first ready for it (sound on,
 * beat chosen). Never again after that: if someone stops the beat on the laptop, the phone
 * must not quietly restart it.
 */
export function useStartBeatOnce() {
  const { state: st } = useStore(walk);
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !st) return;
    if (st.phase === 'walking')
      asked.current = true; // already playing
    else if (st.audioOn && st.phase === 'ready') {
      asked.current = true;
      sendWalkCommand('startBeat');
    }
  }, [st]);
}

/** A calm circle that pulses exactly on the laptop's beat (clock-synced). */
export function BeatPulse({ size = 180, dark = false }: { size?: number; dark?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const st = walk.get().state;
      const el = ref.current;
      if (!el) return;
      if (!st || st.beatPhoneT === null || !st.periodMs) {
        el.style.transform = 'scale(1)';
        return;
      }
      const ph = (((performance.now() - st.beatPhoneT) % st.periodMs) + st.periodMs) % st.periodMs;
      const k = Math.exp(-(ph / st.periodMs) * 6); // quick swell on the beat, slow settle
      el.style.transform = `scale(${1 + 0.1 * k})`;
      el.style.opacity = String(0.8 + 0.2 * k);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className={`pulse${dark ? ' pulse--dark' : ''}`} style={{ width: size, height: size }}>
      <div ref={ref} className="pulse__core" />
    </div>
  );
}

export function Step2({ go }: { go: Go }) {
  const { state: st } = useStore(walk);
  const tempo = st?.tempo ?? 0;
  const notes = st?.calNotes ?? [];

  // Not taken the phone out yet? Remind them once, gently, after 12 s.
  useEffect(() => {
    const id = window.setTimeout(() => {
      buzz(300);
      chime();
      speak('Take your phone out and press Start the main walk.');
    }, 12_000);
    return () => window.clearTimeout(id);
  }, []);

  const startMain = () => {
    startSensing();
    sendWalkCommand('startBeat');
    speak('Starting. Phone in your pocket, and walk along to the beat.');
    go('walking');
  };

  const speech = `Done, your pace is found. Your beat is ${tempo} steps a minute. Now the main walk: press Start the main walk, put the phone back in your pocket, and walk along to the beat.`;
  return (
    <Screen
      speech={speech}
      crumb="Step 2 of 2"
      onBack={() => {
        sendWalkCommand('stopBeat');
        go('step1');
      }}
    >
      <section className="pt__intro pt__done" role="status" aria-live="assertive">
        <p className="pt__donebadge">
          <span aria-hidden="true">✓</span> 20 seconds done
        </p>
        <h1>Pace found. Now the main walk.</h1>
        <p className="pt__lead">
          Your beat: <strong>{tempo} steps a minute</strong>
          {st?.baseline ? `, a little quicker than your ${Math.round(st.baseline)}.` : '.'}
        </p>
      </section>
      {notes.length > 0 && (
        <ul className="pt__note pt__notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {!st?.audioOn && (
        <p className="pt__note" role="status">
          Ask someone to press Start audio on the laptop so you can hear the beat.
        </p>
      )}
      <Button hero onClick={startMain}>
        <span className="btn__disc">
          <IconPlay />
        </span>
        <span className="btn__text">
          <span className="btn__title">Start the main walk</span>
          <span className="btn__sub">The beat starts. Phone back in your pocket.</span>
        </span>
      </Button>
      <div className="pt__pair">
        <Button variant="secondary" onClick={() => sendWalkCommand('nudge', -2)}>
          A bit slower
        </Button>
        <Button variant="secondary" onClick={() => sendWalkCommand('nudge', 2)}>
          A bit faster
        </Button>
      </div>
      <Button variant="secondary" onClick={() => go('step1')}>
        Measure my pace again
      </Button>
    </Screen>
  );
}
