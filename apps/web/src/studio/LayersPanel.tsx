/**
 * "Playing now": which music layers are on. Filled marigold pill = playing, dashed = next to
 * come in ("soon"), plain outline = waiting. State is always in words too, not colour alone.
 */
import { LAYER_COUNT, LAYER_UP } from '@footnotes/shared';
import { useStore } from '../shared/store';
import { audio } from './audio/engine';
import { LAYER_NAMES } from './music/band';
import { arranger, type Force } from './music/arranger';
import { sync } from './sync';

export function LayersPanel() {
  const st = useStore(arranger.state);
  const { playing } = useStore(audio.state);
  const next = st.on.findIndex((v) => !v);
  const count = st.on.filter(Boolean).length;
  const { difficulty } = useStore(sync.state);

  return (
    <section className="panel" aria-labelledby="layers-h">
      <div className="layers__top">
        <h2 id="layers-h" className="panel__h">
          Playing now
        </h2>
        <p className="layers__count">{playing ? `${count + 1} of ${LAYER_COUNT + 1}` : 'Silent'}</p>
      </div>
      <ul className="chips">
        <li className={`chip ${playing ? 'chip--on' : ''}`}>Beat{!playing && ', not started'}</li>
        {LAYER_NAMES.map((name, i) => {
          const on = playing && st.on[i];
          const soon = playing && !on && i === next;
          return (
            <li key={name} className={`chip ${on ? 'chip--on' : soon ? 'chip--soon' : ''}`}>
              {name}
              {soon && ', soon'}
            </li>
          );
        })}
      </ul>
      {playing && next >= 0 && st.fakeScore === null && (
        <p className="panel__p panel__p--sm">
          {LAYER_NAMES[next]} comes in at {Math.round(LAYER_UP[next] * 100)}% in step.
        </p>
      )}
      <div className="seg seg--dark seg--sm" role="group" aria-label="How strict the timing is">
        <button
          type="button"
          className="seg__btn"
          aria-pressed={difficulty === 'easy'}
          onClick={() => sync.setDifficulty('easy')}
        >
          Easy timing
        </button>
        <button
          type="button"
          className="seg__btn"
          aria-pressed={difficulty === 'normal'}
          onClick={() => sync.setDifficulty('normal')}
        >
          Strict timing
        </button>
      </div>
    </section>
  );
}

/** Hidden debug panel (press D): fake the score, force layers, for tuning the music. */
export function MusicDebug({ onClose }: { onClose: () => void }) {
  const st = useStore(arranger.state);
  const faking = st.fakeScore !== null;
  return (
    <section className="panel debug" aria-labelledby="dbg-h">
      <div className="layers__top">
        <h2 id="dbg-h" className="panel__h">
          Music debug
        </h2>
        <button type="button" className="linkbtn" onClick={onClose}>
          Close (D)
        </button>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={faking}
          onChange={(e) => arranger.setFakeScore(e.target.checked ? 0.5 : null)}
        />
        Use a fake score
      </label>
      <div className="slider slider--dark">
        <label htmlFor="fake">
          Fake score{' '}
          <output htmlFor="fake">{faking ? `${Math.round(st.fakeScore! * 100)}%` : 'off'}</output>
        </label>
        <input
          id="fake"
          type="range"
          min={0}
          max={100}
          step={1}
          disabled={!faking}
          value={Math.round((st.fakeScore ?? 0) * 100)}
          onChange={(e) => arranger.setFakeScore(Number(e.target.value) / 100)}
        />
      </div>
      <p className="panel__p panel__p--sm">
        Level now: {st.level} of {LAYER_COUNT} (score at last bar {Math.round(st.lastScore * 100)}
        %). Changes land on the next bar line.
      </p>
      <table className="dbg">
        <tbody>
          {LAYER_NAMES.map((name, i) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              <td>
                <div className="seg seg--dark seg--sm" role="group" aria-label={`${name} layer`}>
                  {(['auto', 'on', 'off'] as Force[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      className="seg__btn"
                      aria-pressed={st.forced[i] === f}
                      onClick={() => arranger.setForce(i, f)}
                    >
                      {f === 'auto' ? 'Auto' : f === 'on' ? 'On' : 'Off'}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="linkbtn" onClick={() => arranger.resetDebug()}>
        Reset debug settings
      </button>
    </section>
  );
}
