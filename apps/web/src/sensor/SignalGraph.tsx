/**
 * Live accelerometer graph on a <canvas>.
 *
 * It redraws ~60 times a second with requestAnimationFrame, reading straight from shared ring
 * buffers, so React is not involved per frame (React re-rendering 60x/s would be slow).
 * The newest data is on the right edge; the picture scrolls left as time passes.
 *
 * Two views:
 *  - 'steps': the step detector's smoothed signal, its adaptive threshold, and a marker for
 *    every detected step. This is the view for tuning.
 *  - 'raw':   |a| magnitude plus the raw x / y / z axes, straight from the sensor.
 */
import { useEffect, useRef } from 'react';
import { motion } from './motion';
import { steps } from './steps';

export type GraphMode = 'steps' | 'raw';

export const RAW_SERIES = [
  { key: 'mag', label: 'Overall (|a|)', color: '#F2B544', width: 3, dash: false },
  { key: 'x', label: 'x', color: '#7FD1A8', width: 1.5, dash: false },
  { key: 'y', label: 'y', color: '#B9C7C0', width: 1.5, dash: false },
  { key: 'z', label: 'z', color: '#5F8A7B', width: 1.5, dash: false },
] as const;

export const STEP_SERIES = [
  { key: 'filtered', label: 'Smoothed movement', color: '#F2B544', width: 3, dash: false },
  { key: 'threshold', label: 'Threshold', color: '#B9C7C0', width: 1.5, dash: true },
  { key: 'step', label: 'Step (hollow = inferred)', color: '#7FD1A8', width: 3, dash: false },
] as const;

interface Props {
  mode?: GraphMode;
  windowMs?: number;
  height?: number;
}

export function SignalGraph({ mode = 'steps', windowMs = 6000, height = 220 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let width = 0;
    // Smoothed y-range so the scale glides instead of jumping.
    let lo = mode === 'raw' ? -12 : -2;
    let hi = mode === 'raw' ? 22 : 4;

    // Keep the canvas sharp on high-DPI phone screens.
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const raw = motion.buffer;
    const frames = steps.frames;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const now = performance.now();
      const t0 = now - windowMs;
      const pad = 12;
      const h = height;
      // In steps view, shift the smoothed curve back by the filter delay so its peaks line up
      // with the step markers (which are already delay-corrected).
      const shift = mode === 'steps' ? steps.filterDelayMs : 0;

      ctx.fillStyle = '#13201C';
      ctx.fillRect(0, 0, width, h);

      // Auto-scale to the visible data.
      let vmin = Infinity;
      let vmax = -Infinity;
      if (mode === 'raw') {
        raw.forEachSince(t0, (i) => {
          const m = Math.hypot(raw.x[i], raw.y[i], raw.z[i]);
          vmin = Math.min(vmin, raw.x[i], raw.y[i], raw.z[i], m);
          vmax = Math.max(vmax, raw.x[i], raw.y[i], raw.z[i], m);
        });
      } else {
        frames.forEachSince(t0 + shift, (i) => {
          vmin = Math.min(vmin, frames.filtered[i]);
          vmax = Math.max(vmax, frames.filtered[i], frames.threshold[i]);
        });
      }
      if (vmin !== Infinity) {
        const margin = Math.max(mode === 'raw' ? 2 : 0.5, (vmax - vmin) * 0.12);
        lo += (vmin - margin - lo) * 0.08;
        hi += (vmax + margin - hi) * 0.08;
      }
      const yOf = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (h - pad * 2);
      const xOf = (t: number) => ((t - t0) / windowMs) * width;

      // One vertical grid line per second.
      ctx.strokeStyle = '#22332D';
      ctx.lineWidth = 1;
      for (let s = Math.ceil(t0 / 1000) * 1000; s <= now; s += 1000) {
        const x = Math.round(xOf(s)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      // Reference line: zero (steps view) or gravity 9.81 m/s² (raw view).
      const ref = mode === 'raw' ? 9.81 : 0;
      if (ref > lo && ref < hi) {
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = '#2F4840';
        ctx.beginPath();
        ctx.moveTo(0, yOf(ref));
        ctx.lineTo(width, yOf(ref));
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const line = (
        color: string,
        w: number,
        dash: boolean,
        each: (plot: (t: number, v: number) => void) => void,
      ) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.lineJoin = 'round';
        ctx.setLineDash(dash ? [6, 6] : []);
        ctx.beginPath();
        let first = true;
        each((t, v) => {
          const x = xOf(t);
          const y = yOf(v);
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      };

      if (mode === 'raw') {
        for (let s = RAW_SERIES.length - 1; s >= 0; s--) {
          const series = RAW_SERIES[s];
          line(series.color, series.width, false, (plot) =>
            raw.forEachSince(t0, (i) =>
              plot(
                raw.t[i],
                series.key === 'mag'
                  ? Math.hypot(raw.x[i], raw.y[i], raw.z[i])
                  : raw[series.key][i],
              ),
            ),
          );
        }
        return;
      }

      // Steps view.
      line(STEP_SERIES[1].color, 1.5, true, (plot) =>
        frames.forEachSince(t0 + shift, (i) => plot(frames.t[i] - shift, frames.threshold[i])),
      );
      line(STEP_SERIES[0].color, 3, false, (plot) =>
        frames.forEachSince(t0 + shift, (i) => plot(frames.t[i] - shift, frames.filtered[i])),
      );
      // Step markers: a tick from the top plus a dot. Real steps filled, inferred hollow.
      ctx.lineWidth = 3;
      for (const s of steps.recent) {
        if (s.t < t0) continue;
        const x = xOf(s.t);
        ctx.strokeStyle = s.inferred ? 'rgba(127, 209, 168, 0.5)' : '#7FD1A8';
        ctx.beginPath();
        ctx.moveTo(x, 4);
        ctx.lineTo(x, 22);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, 30, 6, 0, Math.PI * 2);
        if (s.inferred) {
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.lineWidth = 3;
        } else {
          ctx.fillStyle = '#7FD1A8';
          ctx.fill();
        }
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [mode, windowMs, height]);

  return (
    <canvas
      ref={canvasRef}
      className="signal-graph"
      style={{ width: '100%', height }}
      role="img"
      aria-label={
        mode === 'steps'
          ? 'Live graph of smoothed movement with detected steps marked'
          : "Live graph of the phone's raw motion sensor"
      }
    />
  );
}
