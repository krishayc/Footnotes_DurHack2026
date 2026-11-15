import { useEffect, useState } from 'react';
import { makeRoomCode } from '@footnotes/shared';
import { LogoMark } from '../ui/Logo';
import { JoinCard } from './JoinCard';
import { useStudioLink, type StudioLinkSnapshot } from './link';
import { useStore } from '../shared/store';
import { audio } from './audio/engine';
import { ControlPanel } from './ControlPanel';
import { InStep } from './SyncPanel';
import { LayersPanel, MusicDebug } from './LayersPanel';
import { arranger } from './music/arranger';
import { ModeBar, SimControls, TapPad } from './ModeBar';
import { session } from './session';
import { sync } from './sync';
import { stepBus, type StepMode } from './steps';
import { useStudioStats } from './useStudioStats';
import { VisualScore } from './VisualScore';
import { startWalkBridge } from './walkBridge';
import { StageBanner } from './StageBanner';
import { DemoGuide } from './DemoGuide';
import '../ui/ui.css';
import './studio.css';

/**
 * Keep the same room code on this laptop (across reloads, new tabs and restarts), so a phone
 * that joined once never ends up waiting in an old room.
 */
function useRoomCode(): string {
  const [code] = useState(() => {
    try {
      const saved = localStorage.getItem('footnotes.room');
      if (saved) return saved;
      const fresh = makeRoomCode();
      localStorage.setItem('footnotes.room', fresh);
      return fresh;
    } catch {
      return makeRoomCode();
    }
  });
  return code;
}

/**
 * The laptop Studio. The score is the hero; beside it, plain typography (how in step, pace,
 * beat, which instruments are playing) and the controls. No boxes: hairlines and space.
 */
export function StudioPage() {
  const room = useRoomCode();
  const { link, snap } = useStudioLink(room);
  const { mode } = useStore(stepBus.settings);
  const sess = useStore(session.state);
  const a = useStore(audio.state);
  const stats = useStudioStats();
  const [debug, setDebug] = useState(false);
  const [guide, setGuide] = useState(false);

  // Keys (outside text fields): D music debug, G demo guide.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      const k = e.key.toLowerCase();
      if (k === 'd') setDebug((d) => !d);
      if (k === 'g') setGuide((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => stepBus.attachLink(link), [link]);
  useEffect(() => {
    session.attachLink(link);
    const stopBridge = startWalkBridge(link);
    return () => {
      session.attachLink(null);
      stopBridge();
    };
  }, [link]);
  useEffect(() => {
    // Dev only: poke at the engine from the browser console (window.__fn).
    if (import.meta.env.DEV)
      Object.assign(window, {
        __fn: {
          audio,
          stepBus,
          session,
          link,
          sync,
          arranger,
          measureMix: () => import('./music/measure').then((m) => m.measureMix()),
        },
      });
  }, [link]);

  useEffect(() => {
    document.documentElement.style.background = 'var(--d-bg-0)';
    return () => {
      document.documentElement.style.background = '';
    };
  }, []);

  const phoneHere = snap.status === 'connected' && snap.peerConnected;
  const live = mode === 'live';
  const walking = sess.phase === 'calibrating' || a.playing;

  return (
    <div className="theme-dark studio">
      <header className="st-top">
        <span className="st-brand">
          <LogoMark size={30} color="var(--c-highlight)" />
          <span className="serif-i">Footnotes</span>
        </span>
        <div className="st-meta">
          <ConnectionStatus snap={live ? snap : null} mode={mode} />
          <span className="st-room">
            room <b>{room}</b>
          </span>
        </div>
      </header>
      <StageBanner />
      <IgnoredPhoneNotice />
      {live && phoneHere && snap.phone && !snap.phone.wakeLock && walking && (
        <div className="notice" role="status">
          <span>
            The phone can&apos;t keep its screen on, so it may stop counting steps in a pocket. On
            the phone: Settings → Display &amp; Brightness → Auto-Lock → Never, and turn off Low
            Power Mode.
          </span>
        </div>
      )}

      <main className="st-main">
        <section className="st-stage" aria-label="The score, live">
          <VisualScore />
          <p className="st-legend">
            <span className="legend-bar" aria-hidden="true" /> the beat
            <span className="legend-dot legend-dot--on" aria-hidden="true" /> a step on time
            <span className="legend-dot legend-dot--near" aria-hidden="true" /> a little early or
            late
            <span className="legend-dot legend-dot--off" aria-hidden="true" /> off the beat
          </p>
        </section>

        <aside className="st-side">
          {debug && <MusicDebug onClose={() => setDebug(false)} />}
          {!a.playing && <ControlPanel />}
          <InStep />
          <dl className="figures">
            <div>
              <dt>their pace</dt>
              <dd>
                {stats.paceSpm ? Math.round(stats.paceSpm) : '–'}
                <small>steps a minute</small>
              </dd>
            </div>
            <div>
              <dt>the beat</dt>
              <dd>
                {sess.phase === 'ready' ? sess.tempo : '–'}
                <small>
                  {sess.phase !== 'ready'
                    ? 'not set yet'
                    : sess.manual
                      ? 'set by hand'
                      : `+${Math.round(sess.offset * 100)}% on their pace`}
                </small>
              </dd>
            </div>
          </dl>
          <LayersPanel />
          {a.playing && <ControlPanel />}
          {mode === 'tap' && <TapPad />}
          {mode === 'sim' && <SimControls />}
          {live && <JoinCard room={room} compact={phoneHere} />}
        </aside>
      </main>

      <footer className="st-foot">
        <ModeBar />
        <button
          type="button"
          className="st-link"
          aria-pressed={guide}
          onClick={() => setGuide((v) => !v)}
        >
          Demo guide
        </button>
      </footer>

      {sess.resumePending && a.status !== 'on' && (
        <button type="button" className="resume" onClick={() => void session.resume()}>
          <span className="resume__title serif-i">Click anywhere to bring the music back</span>
          <span className="resume__sub">
            The page was refreshed. Your walk is saved: beat {sess.tempo} BPM.
          </span>
          <span
            className="resume__skip"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              session.dismissResume();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation();
                session.dismissResume();
              }
            }}
          >
            Start fresh instead
          </span>
        </button>
      )}

      {guide && <DemoGuide onClose={() => setGuide(false)} />}
    </div>
  );
}

/** The phone is sending steps but the laptop is using Tap mode or the Simulated walker. */
function IgnoredPhoneNotice() {
  const { at } = useStore(stepBus.ignoredPhone);
  const { mode } = useStore(stepBus.settings);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (mode === 'live' || at === null || performance.now() - at > 5000) return null;
  return (
    <div className="notice" role="alert">
      <span>
        The phone is sending steps, but the laptop is using{' '}
        {mode === 'tap' ? 'Tap mode' : 'the Simulated walker'}, so they aren&apos;t shown.
      </span>
      <button type="button" className="modebar__btn" onClick={() => stepBus.setMode('live')}>
        Use the phone&apos;s steps
      </button>
    </div>
  );
}

function ConnectionStatus({ snap, mode }: { snap: StudioLinkSnapshot | null; mode: StepMode }) {
  let text: string;
  let color: string;
  if (!snap) {
    text = mode === 'tap' ? 'Tap mode: no phone needed' : 'Simulated walker: no phone needed';
    color = 'var(--c-highlight)';
  } else if (snap.status === 'reconnecting' || snap.status === 'connecting') {
    text =
      snap.status === 'connecting'
        ? 'Connecting...'
        : 'We lost the server connection. Trying again...';
    if (snap.attempts > 1) text += ` (try ${snap.attempts})`;
    color = 'var(--d-slightly-off)';
  } else if (snap.status === 'error') {
    text = snap.error ?? 'Connection problem';
    color = 'var(--d-slightly-off)';
  } else if (!snap.peerConnected) {
    text = 'Waiting for phone';
    color = 'var(--d-note-3)';
  } else if (snap.phoneSilentMs !== null && snap.phoneSilentMs > 4000) {
    text = `Phone quiet for ${Math.round(snap.phoneSilentMs / 1000)} s. Is its screen on?`;
    color = 'var(--d-slightly-off)';
  } else if (snap.phone && snap.phone.motion !== 'granted') {
    text = 'Phone connected. Tap Start sensor on the phone';
    color = 'var(--d-slightly-off)';
  } else {
    text = `Phone connected${snap.lastRtt !== null ? ` · ${Math.round(snap.lastRtt)} ms` : ''}`;
    color = 'var(--d-on-time)';
  }
  return (
    <span className="studio__status" role="status" title={snap?.url}>
      <span className="dot" style={{ color }} aria-hidden="true" />
      {text}
    </span>
  );
}
