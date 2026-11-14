import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { normaliseRoomCode, ROOM_CODE_LENGTH } from '@footnotes/shared';
import { Button } from '../ui/Button';
import { Wordmark } from '../ui/Logo';
import { IconArrowRight, IconLaptop, IconPhone } from '../ui/icons';
import { EnvChecklist } from './EnvChecklist';
import './landing.css';

/** Landing: pick a role. The phone also enters the room code shown on the laptop. */
export function Landing() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('room') ?? '');
  const [showJoin, setShowJoin] = useState(!!params.get('room'));
  const [error, setError] = useState<string | null>(null);

  function join(e: FormEvent) {
    e.preventDefault();
    const room = normaliseRoomCode(code);
    if (!room) {
      setError(`The code is ${ROOM_CODE_LENGTH} letters or numbers, shown on the laptop.`);
      return;
    }
    navigate(`/sensor?room=${room}`);
  }

  return (
    <main className="landing fade-in">
      <Wordmark size={40} />

      <section className="landing__intro">
        <h1>Music that walks with you.</h1>
        <p className="landing__pitch">
          Footnotes turns a clinical walking aid into a living piece of music that grows when you
          walk in time with it.
        </p>
      </section>

      <section className="landing__roles" aria-label="Choose this device's role">
        <Button variant="secondary" hero onClick={() => navigate('/studio')}>
          <span className="btn__disc" style={{ background: 'var(--c-primary-tint)' }}>
            <IconLaptop />
          </span>
          <span className="btn__text">
            <span className="btn__title">I'm the Studio</span>
            <span className="btn__sub">This laptop plays the music and shows the score</span>
          </span>
        </Button>

        {!showJoin ? (
          <Button hero onClick={() => setShowJoin(true)}>
            <span className="btn__disc">
              <IconPhone />
            </span>
            <span className="btn__text">
              <span className="btn__title">I'm the Sensor</span>
              <span className="btn__sub">This phone goes in your pocket</span>
            </span>
          </Button>
        ) : (
          <form className="card landing__join" onSubmit={join}>
            <label htmlFor="room">Room code from the laptop</label>
            <input
              id="room"
              className="code-input"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={ROOM_CODE_LENGTH}
              value={code}
              aria-invalid={!!error}
              aria-describedby="room-hint"
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError(null);
              }}
              autoFocus
            />
            <p
              id="room-hint"
              className={error ? 'landing__note' : 'landing__hint'}
              role={error ? 'alert' : undefined}
            >
              {error ?? 'Or scan the QR code on the laptop with your camera.'}
            </p>
            <Button type="submit" onClick={() => undefined}>
              Join <IconArrowRight />
            </Button>
          </form>
        )}
      </section>

      <section className="card" aria-label="Device checks">
        <EnvChecklist />
      </section>

      <p className="landing__footer">
        A research-informed prototype built at DurHack 2026. Not a medical device.
      </p>
    </main>
  );
}
