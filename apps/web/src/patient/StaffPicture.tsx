/**
 * A walk drawn as music on five staff lines:
 *  - one dot per moment of the walk, climbing higher the more in step it was, and marigold
 *    where it was in step (also higher, so it never relies on colour alone);
 *  - small lower dots where the bass was playing (the music had bloomed);
 *  - a clear gap with a soft squiggle where they paused.
 */
import { forwardRef } from 'react';
import type { WalkPoint } from './history';

interface Props {
  points: WalkPoint[];
  dark?: boolean;
  height?: number;
  label: string;
}

const W = 340;

export const StaffPicture = forwardRef<SVGSVGElement, Props>(function StaffPicture(
  { points, dark = true, height = 120, label },
  ref,
) {
  const H = height;
  const pad = 14;
  const lineGap = (H - pad * 2) / 4;
  const staff = [0, 1, 2, 3, 4].map((i) => pad + i * lineGap);
  // Keep at most ~48 dots so it stays calm and readable.
  const step = Math.max(1, Math.ceil(points.length / 48));
  const pts = points.filter((_, i) => i % step === 0);
  const n = Math.max(1, pts.length - 1);
  const X = (i: number) => 14 + (i / n) * (W - 28);
  const Y = (score: number) => staff[4] - 4 - score * (staff[4] - staff[0] - 8);
  const ink = dark ? '#2F4840' : '#C9D3CD';
  const muted = dark ? '#6E9486' : '#4A5752';

  const squiggles: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].paused && !pts[i - 1]?.paused) {
      let j = i;
      while (j + 1 < pts.length && pts[j + 1].paused) j++;
      const x0 = X(i) - 4;
      const x1 = X(j) + 4;
      const y = staff[2];
      let d = `M${x0},${y}`;
      for (let x = x0; x < x1; x += 8) d += ` q2,-5 4,0 q2,5 4,0`;
      squiggles.push(d);
    }
  }

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label={label}
      xmlns="http://www.w3.org/2000/svg"
    >
      {staff.map((y) => (
        <line key={y} x1="6" x2={W - 6} y1={y} y2={y} stroke={ink} strokeWidth="1.5" />
      ))}
      {squiggles.map((d) => (
        <path key={d} d={d} fill="none" stroke={muted} strokeWidth="2" strokeLinecap="round" />
      ))}
      {pts.map((p, i) =>
        p.paused ? null : (
          <g key={i}>
            {p.layers >= 2 && <circle cx={X(i)} cy={staff[4] + 0.5} r="2.6" fill={muted} />}
            <circle
              cx={X(i)}
              cy={Y(p.score)}
              r={p.score >= 0.6 ? 5 : 4}
              fill={p.score >= 0.6 ? '#F2B544' : muted}
            />
          </g>
        ),
      )}
    </svg>
  );
});
