/** Under the hood: the freeze index numbers and our Daphnet evaluation. */
import { DAPHNET_RESULTS } from '@footnotes/shared';
import { useStore } from '../shared/store';
import { freezeWatch } from './freeze';

const ROWS = [
  ['ankle', 'Ankle'],
  ['thigh', 'Thigh (closest to a pocket)'],
  ['trunk', 'Hip'],
] as const;

export function FreezeDetails() {
  const f = useStore(freezeWatch.state);
  const last = f.last;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <section className="panel hood__wide" aria-labelledby="fzd-h">
      <h2 id="fzd-h" className="panel__h">
        Freeze index and our Daphnet test
      </h2>
      <dl className="sync__nums">
        <div>
          <dt>Freeze index now ({f.source === 'replay' ? 'recording' : 'phone, experimental'})</dt>
          <dd>{last ? last.fi.toFixed(2) : '-'}</dd>
        </div>
        <div>
          <dt>Alert when index above</dt>
          <dd>{f.thresholds.fi.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Movement power (must exceed {f.thresholds.power.toFixed(2)})</dt>
          <dd>{last ? last.totalPower.toFixed(2) : '-'}</dd>
        </div>
        <div>
          <dt>Window</dt>
          <dd>4 s at 64 Hz, every 0.5 s</dd>
        </div>
      </dl>
      <p className="panel__p panel__p--sm">
        Freeze index (Moore et al., 2008) = power at 3–8 Hz (trembling) ÷ power at 0.5–3 Hz
        (walking), from an FFT of the acceleration magnitude. Tested on all{' '}
        {DAPHNET_RESULTS.episodes} annotated freezes in the Daphnet dataset (
        {DAPHNET_RESULTS.subjects} patients, {DAPHNET_RESULTS.hours} h), leaving each patient out
        when choosing thresholds:
      </p>
      <table className="dbg">
        <thead>
          <tr>
            <th>Sensor</th>
            <th>Freeze time flagged</th>
            <th>Normal time left alone</th>
            <th>Freezes caught</th>
            <th>False alarms / hour</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([k, label]) => {
            const r = DAPHNET_RESULTS[k];
            return (
              <tr key={k}>
                <td>{label}</td>
                <td>{pct(r.windowSensitivity)}</td>
                <td>{pct(r.windowSpecificity)}</td>
                <td>
                  {r.eventsDetected}/{r.events}
                </td>
                <td>{r.falseAlarmsPerHour}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="panel__p panel__p--sm">
        Honest limits: the ankle works best; sensors higher up (where a pocket phone is) do worse,
        and every position gives far too many false alarms for daily life (turns look like
        trembling). So the live phone index is experimental and off by default; the demo replays
        real recordings. Full write-up: docs/daphnet-evaluation.md.
      </p>
    </section>
  );
}
