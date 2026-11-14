/**
 * Stage 3 live view: what the phone feels, drawn on the LAPTOP's clock.
 *
 * Top: the phone's overall movement (from accel batches). Bottom: a dot for every step.
 * Everything arrives in phone time and is shifted by the clock-sync offset, so the dots sit
 * where the foot actually landed, a little behind "now" (the right edge) because of
 * detection + network delay. That gap is the "step arrives after" number in the side panel.
 */
import { useEffect, useRef } from 'react';
import type { StudioLink } from './link';

interface Props {
  link: StudioLink;
  windowMs?: number;
}

export function LiveLane({ link, windowMs = 8000 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let w = 0;
    let h = 0;
    let hi = 14;
    let lo = 6;

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

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const now = performance.now();
      const t0 = now - windowMs;
      const est = link.clock.current;
      const xOf = (t: number) => ((t - t0) / windowMs) * w;

      ctx.fillStyle = '#13201C';
      ctx.fillRect(0, 0, w, h);

      // Seconds grid.
      ctx.strokeStyle = '#1F302A';
      ctx.lineWidth = 1;
      for (let s = Math.ceil(t0 / 1000) * 1000; s <= now; s += 1000) {
        const x = Math.round(xOf(s)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      if (!est) {
        ctx.fillStyle = '#B9C7C0';
        ctx.font = '600 20px "Atkinson Hyperlegible", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          link.conn.getSnapshot().peerConnected ? 'Syncing clocks...' : 'Waiting for the phone...',
          w / 2,
          h / 2,
        );
        return;
      }

      const off = est.offset; // phone - laptop
      const signalTop = 24;
      const signalH = h * 0.58;
      const laneY = signalTop + signalH + (h - signalTop - signalH) / 2;

      // Movement line.
      const acc = link.accel;
      let vmin = Infinity;
      let vmax = -Infinity;
      acc.forEachSince(t0 + off, (i) => {
        const m = Math.hypot(acc.x[i], acc.y[i], acc.z[i]);
        if (m < vmin) vmin = m;
        if (m > vmax) vmax = m;
      });
      if (vmin !== Infinity) {
        lo += (Math.min(vmin, 8) - 1 - lo) * 0.06;
        hi += (Math.max(vmax, 12) + 1 - hi) * 0.06;
      }
      const yOf = (v: number) => signalTop + (1 - (v - lo) / (hi - lo)) * signalH;
      ctx.strokeStyle = '#6E9486';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let first = true;
      acc.forEachSince(t0 + off, (i) => {
        const x = xOf(acc.t[i] - off);
        const y = yOf(Math.hypot(acc.x[i], acc.y[i], acc.z[i]));
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Steps lane.
      ctx.strokeStyle = '#22332D';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, laneY);
      ctx.lineTo(w, laneY);
      ctx.stroke();

      for (const s of link.steps) {
        const t = s.phoneT - off;
        if (t < t0) continue;
        const x = xOf(t);
        // Gentle fade-in over 300 ms after arrival.
        const age = Math.min(1, (now - s.receivedAt) / 300);
        ctx.globalAlpha = age;
        // Faint line up into the signal so you can see which bump made the step.
        ctx.strokeStyle = 'rgba(242, 181, 68, 0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, signalTop);
        ctx.lineTo(x, laneY - 12);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, laneY, 9, 0, Math.PI * 2);
        if (s.inferred) {
          ctx.strokeStyle = '#F2B544';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else {
          ctx.fillStyle = '#F2B544';
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // "Now" edge.
      ctx.strokeStyle = '#F1F3EE';
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w - 1, 0);
      ctx.lineTo(w - 1, h);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [link, windowMs]);

  return (
    <canvas
      ref={ref}
      className="lane"
      role="img"
      aria-label="Live movement from the phone with each step marked, on the laptop's clock"
    />
  );
}
