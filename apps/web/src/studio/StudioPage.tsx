import { useEffect, useState } from 'react';
import { makeRoomCode } from '@footnotes/shared';
import { LogoMark } from '../ui/Logo';
import { JoinCard } from './JoinCard';
import { LiveLane } from './LiveLane';
import { useStudioLink, type StudioLinkSnapshot } from './link';
import { useStore } from '../shared/store';
import { audio } from './audio/engine';
import { ControlPanel } from './ControlPanel';
import { SyncPanel } from './SyncPanel';
import { LayersPanel, MusicDebug } from './LayersPanel';
import { arranger } from './music/arranger';
import { ModeBar, SimControls, TapPad } from './ModeBar';
import { session } from './session';
import { sync } from './sync';
import { stepBus } from './steps';
import { useStudioStats } from './useStudioStats';
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
 * The laptop Studio (for judges). Stage 4: sound, calibration, the steady beat, and the
 * three step sources (live phone, tap mode, simulated walker).
 * Later stages add sync scoring, the adaptive music, the visual score and Under the hood.
 */
export function StudioPage() {
  const room = useRoomCode();
  const { link, snap } = useStudioLink(room);
  const { mode } = useStore(stepBus.settings);
  const sess = useStore(session.state);
  const a = useStore(audio.state);
  const stats = useStudioStats();
  const [debug, setDebug] = useState(false);

  // Press D (outside text fields) to open the hidden music debug panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'd' || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      setDebug((d) => !d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => stepBus.attachLink(link), [link]);
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
    session.attachLink(link);
    return () => session.attachLink(null);
  }, [link]);

  useEffect(() => {
    document.documentElement.style.background = 'var(--d-bg-0)';
    return () => {
      document.documentElement.style.background = '';
    };
  }, []);

  const phoneHere = snap.status === 'connected' && snap.peerConnected;
  const live = mode === 'live';

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
          <ConnectionStatus snap={snap} />
          <span>
            Room <span className="studio__code">{room}</span>
          </span>
        </div>
      </header>

      <main className="studio__body">
        <section className="studio__stage" aria-label="The beat and the steps">
          <h2 className="studio__h">The beat and the steps, live</h2>
          <LiveLane link={link} />
          <p className="studio__legend">
            <span className="legend-bar" aria-hidden="true" /> a beat (always steady)
            <span className="legend-dot legend-dot--on" aria-hidden="true" /> step on time
            <span className="legend-dot legend-dot--near" aria-hidden="true" /> a bit early or late
            <span className="legend-dot legend-dot--off" aria-hidden="true" /> off the beat
            {live && (
              <>
                <span className="legend-line" aria-hidden="true" /> movement felt by the phone
              </>
            )}
          </p>
        </section>

        <aside className="studio__side">
          {debug && <MusicDebug onClose={() => setDebug(false)} />}
          <SyncPanel />
          <LayersPanel />
          <ControlPanel />
          {mode === 'tap' && <TapPad />}
          {mode === 'sim' && <SimControls />}
          {live && !phoneHere && <JoinCard room={room} />}

          <div className="tiles">
            <Tile
              label="Their pace now"
              value={stats.paceSpm ? Math.round(stats.paceSpm) : '-'}
              unit="steps/min"
            />
            <Tile
              label="The beat"
              value={sess.phase === 'ready' ? sess.tempo : '-'}
              unit="BPM"
              hint={a.playing ? 'playing' : sess.phase === 'ready' ? 'ready' : 'not set yet'}
            />
            <Tile
              label="Beat steadiness"
              value={stats.beatSpreadMs !== null ? stats.beatSpreadMs.toFixed(2) : '-'}
              unit="ms"
              hint="spread of beat gaps"
            />
            <Tile label="Steps" value={stepBus.total || '-'} hint="since the page opened" />
            {live && (
              <>
                <Tile
                  label="Round trip"
                  value={snap.lastRtt !== null ? Math.round(snap.lastRtt) : '-'}
                  unit="ms"
                  hint={snap.clock ? `best ${Math.round(snap.clock.rtt)} ms` : undefined}
                />
                <Tile
                  label="Step arrives after"
                  value={snap.stepLatencyMs !== null ? Math.round(snap.stepLatencyMs) : '-'}
                  unit="ms"
                  hint="detection + network"
                />
                <Tile
                  label="Clock offset"
                  value={snap.clock ? (snap.clock.offset / 1000).toFixed(3) : '-'}
                  unit="s"
                  hint={
                    snap.clock ? `± ${Math.round(snap.clock.uncertainty)} ms` : 'phone − laptop'
                  }
                />
                <Tile
                  label="Phone sensor"
                  value={snap.phone?.rateHz ? Math.round(snap.phone.rateHz) : '-'}
                  unit="Hz"
                  hint={
                    snap.phone
                      ? snap.phone.motion === 'granted'
                        ? snap.phone.wakeLock
                          ? 'on, screen kept awake'
                          : 'on, screen may sleep'
                        : 'sensor not started yet'
                      : undefined
                  }
                />
              </>
            )}
          </div>
          {live && phoneHere && <JoinCard room={room} compact />}
        </aside>
      </main>

      <footer className="studio__footer">
        <ModeBar />
      </footer>
    </div>
  );
}

function ConnectionStatus({ snap }: { snap: StudioLinkSnapshot }) {
  let text: string;
  let color: string;
  if (snap.status === 'reconnecting' || snap.status === 'connecting') {
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
  } else {
    text = `Phone connected${snap.lastRtt !== null ? ` · ${Math.round(snap.lastRtt)} ms` : ''}`;
    color = 'var(--d-on-time)';
  }
  return (
    <span className="studio__status" role="status" title={snap.url}>
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
