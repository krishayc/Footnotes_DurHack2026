/**
 * The visual score: the walk and the music drawn together as a living, scrolling score.
 *
 * Time flows right to left; "now" is the bright line near the right edge (a little of the
 * future is shown, because the music is scheduled slightly ahead).
 *
 * Top to bottom, each lane appears only while its layer plays, and is drawn from the ACTUAL
 * notes being played (not a decoration):
 *   Sparkle  tiny high twinkles
 *   Melody   a smooth line through the melody's pitches
 *   Keys     a smooth line through each chord's centre, with the chord notes as soft dots
 *   Bass     a stepped line, one step per bass note
 *   Shakers  small dots on the eighth notes
 *   Steps    the beat as marigold bars, each step as a dot placed by its timing
 *            (green on time, gold a bit early or late)
 * Faint vertical lines mark beats; stronger ones mark bar lines.
 * When the walker is in step the picture is rich and full; when they drift it thins out to
 * the beat and the steps alone.
 */
import { useEffect, useRef } from 'react';
import { audio, type ScoreNote } from './audio/engine';
import { LAYER_NAMES } from './music/band';
import { arranger } from './music/arranger';
import { stepBus } from './steps';
import { phaseColour, sync } from './sync';

const PAST_MS = 10_000;
const FUTURE_MS = 1_200;

interface Lane {
  layer: number; // index into LAYER_NAMES / note.layer; -1 = steps
  label: string;
  /** Fraction of the height. */
  h: number;
  lo: number; // midi range shown
  hi: number;
  colour: string;
}

const LANES: Lane[] = [
  { layer: 4, label: LAYER_NAMES[4], h: 0.1, lo: 66, hi: 86, colour: '#E7C98B' },
  { layer: 3, label: LAYER_NAMES[3], h: 0.2, lo: 60, hi: 76, colour: '#F2B544' },
  { layer: 2, label: LAYER_NAMES[2], h: 0.17, lo: 51, hi: 66, colour: '#9FB5AC' },
  { layer: 1, label: LAYER_NAMES[1], h: 0.13, lo: 30, hi: 46, colour: '#7FA394' },
  { layer: 0, label: LAYER_NAMES[0], h: 0.08, lo: 0, hi: 1, colour: '#6E9486' },
  { layer: -1, label: 'Steps', h: 0.2, lo: 0, hi: 1, colour: '#7FD1A8' },
];

export function VisualScore() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let w = 0;
    let h = 0;
    // Smoothly fading lane visibility, so lanes grow in and out instead of popping.
    const vis = LANES.map(() => 0);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const now = performance.now();
      const t0 = now - PAST_MS;
      const t1 = now + FUTURE_MS;
      const X = (t: number) => ((t - t0) / (t1 - t0)) * w;
      const playing = audio.state.get().playing;
      const on = arranger.state.get().on;

      ctx.fillStyle = '#0F1916';
      ctx.fillRect(0, 0, w, h);

      // Lane geometry.
      const top = 14;
      const usable = h - top - 10;
      let y = top;
      const boxes = LANES.map((lane) => {
        const box = { y, h: lane.h * usable };
        y += box.h;
        return box;
      });

      // Lane visibility eases toward on/off (steps lane always on).
      LANES.forEach((lane, i) => {
        const target = lane.layer < 0 ? 1 : playing && on[lane.layer] ? 1 : 0;
        vis[i] += (target - vis[i]) * (reduced ? 1 : 0.06);
      });

      // ---- Beat and bar lines across the whole score. ----
      const beats: { t: number; first: boolean }[] = [];
      if (playing) {
        for (const b of audio.beats)
          if (b.t >= t0) beats.push({ t: b.t, first: b.beatInBar === 0 });
        const last = audio.beats[audio.beats.length - 1];
        if (last) {
          const p = audio.periodMs;
          for (let k = 1, t = last.t + p; t <= t1; k++, t += p)
            beats.push({ t, first: (last.beatInBar + k) % 4 === 0 });
        }
      }
      for (const b of beats) {
        const x = Math.round(X(b.t)) + 0.5;
        ctx.strokeStyle = b.first ? '#22332D' : '#17251F';
        ctx.lineWidth = b.first ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, h - 10);
        ctx.stroke();
      }

      // ---- Layer lanes. ----
      const notes = audio.notes;
      LANES.forEach((lane, i) => {
        const box = boxes[i];
        const a = vis[i];
        // Lane label, always readable; dim when the layer is waiting.
        ctx.globalAlpha = 0.45 + 0.55 * a;
        ctx.fillStyle = lane.layer < 0 ? '#B9C7C0' : a > 0.5 ? lane.colour : '#4F6A60';
        ctx.font = '600 14px "Bricolage Grotesque", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(lane.label, 10, box.y + 16);
        ctx.globalAlpha = 1;
        if (lane.layer < 0 || a < 0.02) return;

        const inLane = notes.filter(
          (n) => n.layer === lane.layer && n.audible && n.t + n.durMs >= t0 && n.t <= t1,
        );
        const Y = (midi: number) =>
          box.y + 8 + (1 - (midi - lane.lo) / (lane.hi - lane.lo)) * (box.h - 16);
        ctx.globalAlpha = a;
        ctx.strokeStyle = lane.colour;
        ctx.fillStyle = lane.colour;
        if (lane.layer === 0) drawShakers(ctx, inLane, X, box);
        else if (lane.layer === 1) drawStepped(ctx, inLane, X, Y);
        else if (lane.layer === 2) drawChords(ctx, inLane, X, Y);
        else if (lane.layer === 3)
          drawCurve(
            ctx,
            inLane.map((n) => ({ t: n.t, end: n.t + n.durMs, y: Y(n.midi) })),
            X,
            3,
          );
        else drawTwinkles(ctx, inLane, X, Y, now);
        ctx.globalAlpha = 1;
      });

      // ---- Steps lane: beat bars and step dots. ----
      const sb = boxes[LANES.length - 1];
      const laneY = sb.y + sb.h / 2 + 6;
      ctx.strokeStyle = '#22332D';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, laneY);
      ctx.lineTo(w, laneY);
      ctx.stroke();
      for (const b of beats) {
        const x = X(b.t);
        ctx.globalAlpha = b.t > now ? 0.4 : 1;
        ctx.fillStyle = '#F2B544';
        const bw = b.first ? 8 : 6;
        roundRect(ctx, x - bw / 2, laneY - 24, bw, 48, bw / 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const s of stepBus.recent) {
        if (s.t < t0 || s.t > t1) continue;
        const phase = sync.phaseOf.get(s);
        ctx.fillStyle = phaseColour(phase);
        ctx.strokeStyle = phaseColour(phase);
        ctx.beginPath();
        ctx.arc(X(s.t), laneY, 9, 0, Math.PI * 2);
        if (s.inferred) {
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else ctx.fill();
      }

      // ---- Now line. ----
      const xn = X(now);
      ctx.strokeStyle = 'rgba(241, 243, 238, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xn, top);
      ctx.lineTo(xn, h - 10);
      ctx.stroke();

      if (!playing) {
        ctx.fillStyle = '#B9C7C0';
        ctx.font = '600 22px "Bricolage Grotesque", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('The score begins when the beat starts', w / 2, boxes[1].y + boxes[1].h / 2);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="score"
      role="img"
      aria-label="The visual score: each music layer drawn from the notes it plays, above the beat and the walker's steps"
    />
  );
}

type XFn = (t: number) => number;
type YFn = (midi: number) => number;

/** A smooth line through notes held for their length; gaps over 0.5 s break the line. */
function drawCurve(
  ctx: CanvasRenderingContext2D,
  pts: { t: number; end: number; y: number }[],
  X: XFn,
  width: number,
) {
  pts.sort((a, b) => a.t - b.t);
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let path: [number, number][] = [];
  const flush = () => {
    if (path.length < 2) {
      path = [];
      return;
    }
    ctx.beginPath();
    ctx.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length - 1; i++) {
      const mx = (path[i][0] + path[i + 1][0]) / 2;
      const my = (path[i][1] + path[i + 1][1]) / 2;
      ctx.quadraticCurveTo(path[i][0], path[i][1], mx, my);
    }
    const last = path[path.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.stroke();
    path = [];
  };
  let prevEnd = -Infinity;
  for (const p of pts) {
    if (p.t - prevEnd > 500) flush();
    path.push([X(p.t), p.y], [X(p.end), p.y]);
    prevEnd = p.end;
  }
  flush();
}

/** Keys: chords grouped by start time; a curve through each chord's centre plus soft dots. */
function drawChords(ctx: CanvasRenderingContext2D, notes: ScoreNote[], X: XFn, Y: YFn) {
  const groups = new Map<number, ScoreNote[]>();
  for (const n of notes) {
    const key = Math.round(n.t / 20);
    const g = groups.get(key) ?? [];
    g.push(n);
    groups.set(key, g);
  }
  const centres = [...groups.values()].map((g) => ({
    t: g[0].t,
    end: g[0].t + g[0].durMs,
    y: Y(g.reduce((a, n) => a + n.midi, 0) / g.length),
  }));
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * 0.35;
  for (const g of groups.values())
    for (const n of g) {
      ctx.beginPath();
      ctx.arc(X(n.t), Y(n.midi), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.globalAlpha = a;
  drawCurve(ctx, centres, X, 2.5);
}

/** Bass: a stepped line, flat for each note, stepping between notes. */
function drawStepped(ctx: CanvasRenderingContext2D, notes: ScoreNote[], X: XFn, Y: YFn) {
  notes.sort((a, b) => a.t - b.t);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  let prev: ScoreNote | null = null;
  for (const n of notes) {
    const x0 = X(n.t);
    const x1 = X(n.t + n.durMs);
    const y = Y(n.midi);
    if (prev && n.t - (prev.t + prev.durMs) < 120) ctx.lineTo(x0, y);
    else ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    prev = n;
  }
  ctx.stroke();
}

function drawShakers(
  ctx: CanvasRenderingContext2D,
  notes: ScoreNote[],
  X: XFn,
  box: { y: number; h: number },
) {
  for (const n of notes) {
    ctx.beginPath();
    ctx.arc(X(n.t), box.y + box.h / 2 + 4, 1.5 + 2.5 * n.vel, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTwinkles(
  ctx: CanvasRenderingContext2D,
  notes: ScoreNote[],
  X: XFn,
  Y: YFn,
  now: number,
) {
  const a = ctx.globalAlpha;
  for (const n of notes) {
    // Brightest just as they sound, fading with age.
    const age = Math.max(0, now - n.t);
    ctx.globalAlpha = a * Math.max(0.25, 1 - age / 6000);
    const x = X(n.t);
    const y = Y(n.midi);
    const r = 3 + 2 * n.vel;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.6, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.6, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = a;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
