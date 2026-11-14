import { useEffect, useState } from 'react';
import { makeRoomCode } from '@footnotes/shared';
import { LogoMark } from '../ui/Logo';
import { JoinCard } from './JoinCard';
import { LiveLane } from './LiveLane';
import { useStudioLink, type StudioLinkSnapshot } from './link';
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
 * The laptop Studio (for judges). Stage 3: live link to the phone with clock sync.
 * Later stages add audio, calibration, the visual score, modes and Under the hood.
 */
export function StudioPage() {
  const room = useRoomCode();
  const { link, snap } = useStudioLink(room);

  useEffect(() => {
    document.documentElement.style.background = 'var(--d-bg-0)';
    return () => {
      document.documentElement.style.background = '';
    };
  }, []);

  const phoneHere = snap.status === 'connected' && snap.peerConnected;

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
        <section className="studio__stage" aria-label="Live from the phone">
          <h2 className="studio__h">Live from the phone</h2>
          <LiveLane link={link} />
          <p className="studio__legend">
            <span className="legend-dot" aria-hidden="true" /> a step, placed where the foot landed
            <span className="legend-ring" aria-hidden="true" /> inferred step (one leg felt)
            <span className="legend-line" aria-hidden="true" /> movement felt by the phone
          </p>
        </section>

        <aside className="studio__side">
          {!phoneHere && <JoinCard room={room} />}
          <div className="tiles">
            <Tile label="Steps" value={snap.stepCount || '-'} />
            <Tile
              label="Their pace"
              value={snap.cadenceSpm && fresh(snap) ? Math.round(snap.cadenceSpm) : '-'}
              unit="steps/min"
            />
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
              hint={snap.clock ? `± ${Math.round(snap.clock.uncertainty)} ms` : 'phone − laptop'}
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
          </div>
          {phoneHere && <JoinCard room={room} compact />}
        </aside>
      </main>
    </div>
  );
}

const fresh = (s: StudioLinkSnapshot) =>
  s.lastStepAt !== null && performance.now() - s.lastStepAt < 3000;

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
