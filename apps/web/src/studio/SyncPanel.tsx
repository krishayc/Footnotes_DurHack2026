/**
 * "In step": the live sync score as a big number, a few plain words, and a hand-drawn wavy
 * line that fills as the walker locks in.
 */
import { useStore } from '../shared/store';
import { sync } from './sync';

/** Plain words for the score, so the state never relies on colour or a number alone. */
export function scoreWords(score: number): string {
  if (score >= 0.8) return 'locked in';
  if (score >= 0.6) return 'mostly in step';
  if (score >= 0.35) return 'finding the beat';
  return 'not in step yet';
}

// A gently wobbling line, like one drawn by hand (viewBox 0 0 300 24).
const WAVE = 'M3 14 C 28 6, 46 20, 72 12 S 118 6, 142 13 S 190 20, 214 11 S 262 6, 297 12';

export function InStep() {
  const s = useStore(sync.state);
  const pct = Math.round(s.score * 100);
  const shown = s.active ? pct : 0;
  return (
    <section className="instep" aria-labelledby="instep-h">
      <h2 id="instep-h" className="eyebrow">
        in step
      </h2>
      <p className="instep__num" aria-live="off">
        {s.active ? pct : '–'}
        {s.active && <span>%</span>}
      </p>
      <p className="instep__words serif-i">
        {s.active ? scoreWords(s.score) : 'the score starts with the beat'}
      </p>
      <svg
        className="instep__wave"
        viewBox="0 0 300 24"
        preserveAspectRatio="none"
        role="meter"
        aria-label="In-step score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
      >
        <path d={WAVE} className="instep__track" pathLength={100} />
        <path
          d={WAVE}
          className="instep__fill"
          pathLength={100}
          style={{ strokeDasharray: `${shown} 100` }}
        />
      </svg>
    </section>
  );
}
