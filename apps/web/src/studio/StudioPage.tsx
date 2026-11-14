import { useEffect, useState } from 'react';
import { makeRoomCode } from '@footnotes/shared';
import { LogoMark } from '../ui/Logo';
import { useEnvironment } from '../shared/environment';
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
 * The laptop Studio (for judges). Stage 0 shell: header, room code, empty score area.
 * Later stages fill in: audio, calibration, visual score, HUD, modes, Under the hood.
 */
export function StudioPage() {
  const room = useRoomCode();
  const env = useEnvironment();

  useEffect(() => {
    document.documentElement.style.background = 'var(--d-bg-0)';
    return () => {
      document.documentElement.style.background = '';
    };
  }, []);

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
          <span className="studio__status">
            <span className="dot" style={{ color: 'var(--d-note-3)' }} aria-hidden="true" />
            Waiting for phone
          </span>
          <span>
            Room <span className="studio__code">{room}</span>
          </span>
        </div>
      </header>

      <main className="studio__main fade-in">
        <div className="studio__empty">
          <LogoMark size={72} color="var(--d-note-1)" />
          <h2>The score will play here.</h2>
          <p>
            On the phone, open this site, choose "I'm the Sensor" and enter <strong>{room}</strong>.
          </p>
        </div>
      </main>

      <footer className="studio__footer">
        Server:{' '}
        {env.server === 'ok'
          ? 'connected'
          : env.server === 'checking'
            ? 'checking...'
            : 'not reachable'}
        {' · '}
        {env.secure ? 'secure connection' : 'not secure (fine on the laptop)'}
      </footer>
    </div>
  );
}
