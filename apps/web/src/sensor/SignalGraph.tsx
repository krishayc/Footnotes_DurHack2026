/**
 * Live accelerometer graph on a <canvas>.
 *
 * It redraws ~60 times a second with requestAnimationFrame, reading straight from the shared
 * ring buffer, so React is not involved per frame (React re-rendering 60x/s would be slow).
 * The newest data is on the right edge; the picture scrolls left as time passes.
 *
 * Lines: |a| magnitude (thick marigold) plus the raw x / y / z axes (thin, muted).
 * The vertical scale adapts smoothly to the data so both a gentle walk and a hard shake fit.
 */
import { useEffect, useRef } from 'react';
import { motion } from './motion';

export const SERIES = [
  { key: 'mag', label: 'Overall (|a|)', color: '#F2B544', width: 3 },
  { key: 'x', label: 'x', color: '#7FD1A8', width: 1.5 },
  { key: 'y', label: 'y', color: '#B9C7C0', width: 1.5 },
  { key: 'z', label: 'z', color: '#5F8A7B', width: 1.5 },
] as const;

interface Props {
  windowMs?: number;
  height?: number;
}

export function SignalGraph({ windowMs = 6000, height = 220 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let width = 0;
    // Smoothed y-range so the scale glides instead of jumping.
    let lo = -12;
    let hi = 22;

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

    const buf = motion.buffer;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const now = performance.now();
      const t0 = now - windowMs;
      const pad = 10;
      const h = height;

      // Background.
      ctx.fillStyle = '#13201C';
      ctx.fillRect(0, 0, width, h);

      // Find the visible data range to auto-scale.
      let vmin = Infinity;
      let vmax = -Infinity;
      buf.forEachSince(t0, (i) => {
        const m = Math.hypot(buf.x[i], buf.y[i], buf.z[i]);
        vmin = Math.min(vmin, buf.x[i], buf.y[i], buf.z[i], m);
        vmax = Math.max(vmax, buf.x[i], buf.y[i], buf.z[i], m);
      });
      if (vmin !== Infinity) {
        const margin = Math.max(2, (vmax - vmin) * 0.1);
        lo += (vmin - margin - lo) * 0.08;
        hi += (vmax + margin - hi) * 0.08;
      }
      const yOf = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (h - pad * 2);
      const xOf = (t: number) => ((t - t0) / windowMs) * width;

      // One vertical grid line per second, scrolling with time.
      ctx.strokeStyle = '#22332D';
      ctx.lineWidth = 1;
      for (let s = Math.ceil(t0 / 1000) * 1000; s <= now; s += 1000) {
        const x = Math.round(xOf(s)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      // Zero line and 1 g (9.81 m/s^2, gravity) line for reference.
      for (const [v, dash] of [
        [0, [] as number[]],
        [9.81, [4, 6]],
      ] as const) {
        if (v < lo || v > hi) continue;
        ctx.setLineDash(dash);
        ctx.strokeStyle = '#2F4840';
        ctx.beginPath();
        ctx.moveTo(0, yOf(v));
        ctx.lineTo(width, yOf(v));
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Data lines: draw thin axes first, magnitude last so it sits on top.
      for (let s = SERIES.length - 1; s >= 0; s--) {
        const series = SERIES[s];
        ctx.strokeStyle = series.color;
        ctx.lineWidth = series.width;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        let first = true;
        buf.forEachSince(t0, (i) => {
          const v =
            series.key === 'mag' ? Math.hypot(buf.x[i], buf.y[i], buf.z[i]) : buf[series.key][i];
          const x = xOf(buf.t[i]);
          const y = yOf(v);
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [windowMs, height]);

  return (
    <canvas
      ref={canvasRef}
      className="signal-graph"
      style={{ width: '100%', height }}
      role="img"
      aria-label="Live graph of the phone's motion sensor"
    />
  );
}
