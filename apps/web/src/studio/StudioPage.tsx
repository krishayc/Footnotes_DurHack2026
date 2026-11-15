import { useCallback, useEffect, useState } from 'react';
import { LAYER_COUNT, makeRoomCode } from '@footnotes/shared';
import { LogoMark } from '../ui/Logo';
import { JoinCard } from './JoinCard';
import { useStudioLink, type StudioLinkSnapshot } from './link';
import { useStore } from '../shared/store';
import { audio } from './audio/engine';
import { ControlPanel } from './ControlPanel';
import { InStepCard } from './SyncPanel';
import { LayersPanel, MusicDebug } from './LayersPanel';
import { arranger } from './music/arranger';
import { ModeBar, SimControls, TapPad } from './ModeBar';
import { session } from './session';
import { sync } from './sync';
import { stepBus } from './steps';
import { useStudioStats } from './useStudioStats';
import { UnderTheHood } from './UnderTheHood';
import { VisualScore } from './VisualScore';
import { startWalkBridge } from './walkBridge';
import { StageBanner } from './StageBanner';
import '../ui/ui.css';
import './studio.css';

/** Keep the same room code across reloads of this tab, so the phone does not need to rejoin. */
function useRoomCode(): string {
  const [code] = useState(() => {
    try {
      const saved = sessionStorage.getItem('footnotes.room');
      if (saved) return saved;
      const fresh = makeRoomCode();
      sessionStorage.setItem('footnotes.room', fresh);
      return fresh;
    } catch {
      return makeRoomCode();
    }
  });
  return code;
}

/**
 * The laptop Studio (for judges). Main area: the visual score. Side: what's happening in
 * plain words (in step %, pace, beat, layers, freeze watch) and the controls. Bottom: where
 * the steps come from, and "Under the hood" for the technical detail.
 */
export function StudioPage() {
  const room = useRoomCode();
  const { link, snap } = useStudioLink(room);
  const { mode } = useStore(stepBus.settings);
  const sess = useStore(session.state);
  const a = useStore(audio.state);
  const arr = useStore(arranger.state);
  const stats = useStudioStats();
  const [debug, setDebug] = useState(false);
  const [hood, setHood] = useState(false);
  const closeHood = useCallback(() => setHood(false), []);

  // Press D (outside text fields) for the hidden music debug panel; H for Under the hood.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      const k = e.key.toLowerCase();
      if (k === 'd') setDebug((d) => !d);
      if (k === 'h') setHood((v) => !v);
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
  const layerCount = a.playing ? arr.on.filter(Boolean).length + 1 : 0;

  return (
    <div className="theme-dark studio">
      <header className="studio__header">
        <div className="studio__left">
          <span className="brand">
            <LogoMark size={34} color="var(--c-highlight)" />
            Footnotes
          </span>
          <span className="pill studio__pill">Studio</span>
        </div>
        <div className="studio__right">
          <ConnectionStatus snap={live ? snap : null} mode={mode} />
          <span>
            Room <span className="studio__code">{room}</span>
          </span>
        </div>
      </header>
      <StageBanner />

      <main className="studio__body">
        <section className="studio__stage" aria-label="The score, live">
          <h2 className="studio__h">The score, live</h2>
          <VisualScore />
          <p className="studio__legend">
            <span className="legend-bar" aria-hidden="true" /> the beat
            <span className="legend-dot legend-dot--on" aria-hidden="true" /> step on time
            <span className="legend-dot legend-dot--near" aria-hidden="true" /> a bit early or late
            <span className="legend-dot legend-dot--off" aria-hidden="true" /> off the beat
            <span className="legend-line legend-line--gold" aria-hidden="true" /> music layers
            appear as they start playing
          </p>
        </section>

        <aside className="studio__side">
          {debug && <MusicDebug onClose={() => setDebug(false)} />}
          {!a.playing && <ControlPanel />}
          <InStepCard />
          <div className="tiles">
            <Tile
              label="Their pace"
              value={stats.paceSpm ? Math.round(stats.paceSpm) : '-'}
              unit="steps/min"
            />
            <Tile
              label="The beat"
              value={sess.phase === 'ready' ? sess.tempo : '-'}
              unit="BPM"
              hint={
                sess.phase !== 'ready'
                  ? 'not set yet'
                  : sess.manual
                    ? 'set by hand'
                    : `+${Math.round(sess.offset * 100)}% on their pace`
              }
            />
            <Tile
              label="Layers"
              value={a.playing ? `${layerCount} of ${LAYER_COUNT + 1}` : '-'}
              hint={a.playing ? 'beat + music' : 'silent'}
            />
            <Tile label="Freeze watch" value="Clear" hint="freeze detection: Stage 8" />
          </div>
          <LayersPanel />
          {a.playing && <ControlPanel />}
          {mode === 'tap' && <TapPad />}
          {mode === 'sim' && <SimControls />}
          {live && <JoinCard room={room} compact={phoneHere} />}
        </aside>
      </main>

      <footer className="studio__footer">
        <ModeBar />
        <button
          type="button"
          className="modebar__btn modebar__btn--hood"
          aria-pressed={hood}
          onClick={() => setHood(true)}
        >
          Under the hood
        </button>
      </footer>

      {sess.resumePending && a.status !== 'on' && (
        <button type="button" className="resume" onClick={() => void session.resume()}>
          <span className="resume__title">Click anywhere to bring the music back</span>
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

      {hood && <UnderTheHood link={link} snap={snap} stats={stats} onClose={closeHood} />}
    </div>
  );
}

function ConnectionStatus({
  snap,
  mode,
}: {
  snap: StudioLinkSnapshot | null;
  mode: 'live' | 'tap' | 'sim';
}) {
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

function Tile({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="tile">
      <p className="tile__label">{label}</p>
      <p className="tile__value">
        {value}
        {unit && value !== '-' && <span className="tile__unit"> {unit}</span>}
      </p>
      {hint && <p className="tile__hint">{hint}</p>}
    </div>
  );
}
