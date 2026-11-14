import { useSearchParams, Link } from 'react-router-dom';
import { Wordmark } from '../ui/Logo';
import { EnvChecklist } from '../landing/EnvChecklist';
import '../landing/landing.css';

/**
 * The patient's phone app. Stage 0 placeholder: shows the room code and device checks.
 * Stage 1 adds motion permission, wake lock and the live signal; Stage 7 adds the full
 * patient flow (Home, Step 1/2, Walking, ...).
 */
export function SensorPage() {
  const [params] = useSearchParams();
  const room = params.get('room');
  return (
    <main className="landing fade-in">
      <Wordmark size={40} />
      <section className="landing__intro">
        <h1>Sensor</h1>
        <p className="landing__pitch">
          {room ? (
            <>
              Room <strong>{room}</strong>. Walking setup arrives in the next stage.
            </>
          ) : (
            'No room code yet.'
          )}
        </p>
      </section>
      <section className="card">
        <EnvChecklist />
      </section>
      <Link to="/" className="btn btn--secondary">
        Back to start
      </Link>
    </main>
  );
}
