/**
 * "Under the hood": the technical panel for judges. Opens as a drawer over the score.
 * Raw signal and steps from the phone, the timing maths, the connection and clock sync,
 * how the phone counts, the music debug controls. (Freeze index arrives in Stage 8.)
 */
import { useEffect } from 'react';
import { LiveLane } from './LiveLane';
import { MusicDebug } from './LayersPanel';
import { PhoneCounting } from './PhoneCounting';
import { SyncDetails } from './SyncPanel';
import type { StudioLink, StudioLinkSnapshot } from './link';
import type { StudioStats } from './useStudioStats';

interface Props {
  link: StudioLink;
  snap: StudioLinkSnapshot;
  stats: StudioStats;
  onClose: () => void;
}

export function UnderTheHood({ link, snap, stats, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const phoneHere = snap.status === 'connected' && snap.peerConnected;
  return (
    <div className="hood" role="dialog" aria-modal="true" aria-labelledby="hood-h">
      <div className="hood__head">
        <h2 id="hood-h">Under the hood</h2>
        <button type="button" className="modebar__btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="hood__grid">
        <section className="panel hood__wide" aria-labelledby="raw-h">
          <h2 id="raw-h" className="panel__h">
            Phone signal and steps
          </h2>
          <p className="panel__p panel__p--sm">
            The grey line is the overall movement the phone feels (accelerometer magnitude, on the
            laptop&apos;s clock after clock sync). Dots are detected steps; bars are beats.
          </p>
          <div className="hood__lane">
            <LiveLane link={link} />
          </div>
        </section>
        <SyncDetails />
        <section className="panel" aria-labelledby="conn-h">
          <h2 id="conn-h" className="panel__h">
            Link and clock sync
          </h2>
          <dl className="sync__nums">
            <div>
              <dt>Round trip to the phone</dt>
              <dd>
                {snap.lastRtt !== null ? `${Math.round(snap.lastRtt)} ms` : '-'}
                {snap.clock && ` (best ${Math.round(snap.clock.rtt)} ms)`}
              </dd>
            </div>
            <div>
              <dt>Clock offset (phone − laptop)</dt>
              <dd>
                {snap.clock
                  ? `${(snap.clock.offset / 1000).toFixed(3)} s ± ${Math.round(snap.clock.uncertainty)} ms`
                  : '-'}
              </dd>
            </div>
            <div>
              <dt>Step arrives after (detection + network)</dt>
              <dd>{snap.stepLatencyMs !== null ? `${Math.round(snap.stepLatencyMs)} ms` : '-'}</dd>
            </div>
            <div>
              <dt>Phone sensor</dt>
              <dd>
                {snap.phone?.rateHz ? `${Math.round(snap.phone.rateHz)} readings a second` : '-'}
              </dd>
            </div>
            <div>
              <dt>Beat steadiness (spread of beat gaps)</dt>
              <dd>{stats.beatSpreadMs !== null ? `${stats.beatSpreadMs.toFixed(2)} ms` : '-'}</dd>
            </div>
          </dl>
          <p className="panel__p panel__p--sm">
            Clock sync: the laptop pings the phone; from the fastest round trips it works out the
            gap between the two clocks, so every step can be placed against the beat to the
            millisecond.
          </p>
        </section>
        {phoneHere && <PhoneCounting link={link} snap={snap} />}
        <MusicDebug onClose={onClose} />
      </div>
    </div>
  );
}
