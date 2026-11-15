/**
 * "In step": the live sync score, plus the maths behind it for judges (phase circle, R,
 * mean phase, tempo match).
 */
import { useStore } from '../shared/store';
import { sync, phaseColour } from './sync';

/** Plain words for the score, so the state never relies on colour or a number alone. */
export function scoreWords(score: number): string {
  if (score >= 0.8) return 'Locked in';
  if (score >= 0.6) return 'Mostly in step';
  if (score >= 0.35) return 'Finding the beat';
  return 'Not in step yet';
}

/** The headline: big "In step" percentage, words and a bar. */
export function InStepCard() {
  const s = useStore(sync.state);
  const pct = Math.round(s.score * 100);
  return (
    <section className="panel sync" aria-labelledby="sync-h">
      <div className="sync__top">
        <div>
          <h2 id="sync-h" className="panel__h">
            In step
          </h2>
          <p className="sync__words">
            {s.active ? scoreWords(s.score) : 'Start the beat to score'}
          </p>
        </div>
        <p className="sync__pct" aria-live="off">
          {s.active ? pct : '-'}
          {s.active && <span>%</span>}
        </p>
      </div>
      <div
        className="sync__bar"
        role="meter"
        aria-label="In-step score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span style={{ width: `${s.active ? pct : 0}%` }} />
      </div>
    </section>
  );
}

/** The maths behind the score (Under the hood): phase circle, R, timing, tempo match. */
export function SyncDetails() {
  const s = useStore(sync.state);
  const st = s.stats;
  const meanMs = st ? st.meanPhase * s.periodMs : null;
  return (
    <section className="panel" aria-labelledby="syncd-h">
      <h2 id="syncd-h" className="panel__h">
        Timing maths
      </h2>
      <div className="sync__detail">
        <PhaseCircle />
        <dl className="sync__nums">
          <div>
            <dt>Consistency (R)</dt>
            <dd>{st ? st.R.toFixed(2) : '-'}</dd>
          </div>
          <div>
            <dt>Average timing</dt>
            <dd>
              {meanMs === null
                ? '-'
                : Math.abs(meanMs) < 15
                  ? 'on the beat'
                  : `${Math.round(Math.abs(meanMs))} ms ${meanMs < 0 ? 'early' : 'late'}`}
            </dd>
          </div>
          <div>
            <dt>Pace vs beat</dt>
            <dd>{st?.tempoRatio ? `${Math.round(st.tempoRatio * 100)}%` : '-'}</dd>
          </div>
          <div>
            <dt>Raw score (before smoothing)</dt>
            <dd>{st ? `${Math.round(st.raw * 100)}%` : '-'}</dd>
          </div>
        </dl>
      </div>
      <p className="panel__p panel__p--sm">
        Each step is a point on a clock face where 12 o&apos;clock is the beat. R is the length of
        the average arrow: 1 = every step lands at the same moment, 0 = all over the place.
      </p>
      <div className="slider slider--dark">
        <label htmlFor="corr">
          Timing correction <output htmlFor="corr">{s.correctionMs} ms</output>
        </label>
        <input
          id="corr"
          type="range"
          min={-200}
          max={200}
          step={5}
          value={s.correctionMs}
          onChange={(e) => sync.setCorrection(Number(e.target.value))}
        />
        <p className="panel__p panel__p--sm">
          If someone walking carefully on the beat always shows as early or late, slide this to
          cancel the constant delay (speakers, step detection).
        </p>
      </div>
    </section>
  );
}

/**
 * The beat as a clock face. Top = exactly on the beat; clockwise = late, anticlockwise = early;
 * the bottom = exactly between two beats. Dots = recent steps (newest brightest). The arrow
 * is the average: its length is R (long = consistent), its direction the mean timing.
 */
function PhaseCircle() {
  useStore(sync.state); // re-render on every scored step
  const steps = sync.scorer.steps.filter((x) => !x.inferred).slice(-10);
  const st = sync.state.get().stats;
  const C = 90;
  const r = 70;
  const pt = (phase: number, radius: number) => {
    const a = 2 * Math.PI * phase - Math.PI / 2;
    return [C + radius * Math.cos(a), C + radius * Math.sin(a)];
  };
  const [ax, ay] = st ? pt(st.meanPhase, st.R * r) : [C, C];

  return (
    <svg
      className="phase"
      width="180"
      height="180"
      viewBox="0 0 180 180"
      role="img"
      aria-label={
        st
          ? `Phase circle: consistency ${st.R.toFixed(2)}, average ${st.meanPhase >= 0 ? 'late' : 'early'} by ${Math.abs(st.meanPhase).toFixed(2)} of a beat`
          : 'Phase circle: no steps yet'
      }
    >
      <circle cx={C} cy={C} r={r} fill="none" stroke="#2F4840" strokeWidth="2" />
      <circle
        cx={C}
        cy={C}
        r={r * 0.5}
        fill="none"
        stroke="#22332D"
        strokeWidth="1"
        strokeDasharray="3 5"
      />
      {/* Beat marker at the top. */}
      <rect x={C - 4} y={C - r - 14} width="8" height="22" rx="4" fill="#F2B544" />
      <text x={C + r + 2} y={C + 5} className="phase__lbl" textAnchor="start">
        late
      </text>
      <text x={C - r - 2} y={C + 5} className="phase__lbl" textAnchor="end">
        early
      </text>
      {steps.map((s, i) => {
        const [x, y] = pt(s.phase, r);
        return (
          <circle
            key={s.t}
            cx={x}
            cy={y}
            r={7}
            fill={phaseColour(s.phase)}
            opacity={0.3 + (0.7 * (i + 1)) / steps.length}
          />
        );
      })}
      {st && (
        <>
          <line
            x1={C}
            y1={C}
            x2={ax}
            y2={ay}
            stroke="#F1F3EE"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx={ax} cy={ay} r="4.5" fill="#F1F3EE" />
        </>
      )}
      <circle cx={C} cy={C} r="3" fill="#B9C7C0" />
    </svg>
  );
}
