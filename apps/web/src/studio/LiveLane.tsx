/**
 * The live lane: the beat and the walker's steps on one timeline (laptop clock).
 *
 *  - Faint vertical lines + marigold rounded bars: the beats. Upcoming beats are drawn a
 *    little ahead of "now" (the bright line), so you can see the steady grid coming.
 *  - Green dots: steps, from whichever source is active (phone, taps, simulated walker),
 *    placed where the foot landed. A step on a beat line is in time.
 *  - Grey line (live phone only): the movement the phone felt.
 *
 * Stage 7 replaces this with the full visual score; the timing logic stays the same.
 */
import { useEffect, useRef } from 'react';
import { audio } from './audio/engine';
import type { StudioLink } from './link';
import { stepBus } from './steps';
import { phaseColour, sync } from './sync';

interface Props {
  link: StudioLink;
  pastMs?: number;
  futureMs?: number;
}

export function LiveLane({ link, pastMs = 7000, futureMs = 1200 }: Props) {
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
      const t0 = now - pastMs;
      const t1 = now + futureMs;
      const span = t1 - t0;
      const xOf = (t: number) => ((t - t0) / span) * w;
      const mode = stepBus.settings.get().mode;
      const est = link.clock.current;

      ctx.fillStyle = '#13201C';
      ctx.fillRect(0, 0, w, h);

      const signalTop = 28;
      const signalH = h * 0.5;
      const laneY = signalTop + signalH + (h - signalTop - signalH) / 2;

      // ---- Beats: past ones from the log, future ones extrapolated from the last. ----
      const playing = audio.state.get().playing;
      const beatTimes: { t: number; first: boolean }[] = [];
      if (playing) {
        for (const b of audio.beats)
          if (b.t >= t0) beatTimes.push({ t: b.t, first: b.beatInBar === 0 });
        const last = audio.beats[audio.beats.length - 1];
        if (last) {
          const period = audio.periodMs;
          for (let k = 1, t = last.t + period; t <= t1; k++, t += period) {
            beatTimes.push({ t, first: (last.beatInBar + k) % 4 === 0 });
          }
        }
      }
      for (const b of beatTimes) {
        const x = Math.round(xOf(b.t)) + 0.5;
        const future = b.t > now;
        ctx.globalAlpha = future ? 0.35 : 1;
        ctx.strokeStyle = b.first ? '#2F4840' : '#22332D';
        ctx.lineWidth = b.first ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        // Marigold rounded bar in the steps lane.
        ctx.fillStyle = '#F2B544';
        const bw = b.first ? 8 : 6;
        roundRect(ctx, x - bw / 2, laneY - 26, bw, 52, bw / 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // ---- Movement line (live phone only, once clocks are synced). ----
      if (mode === 'live' && est) {
        const off = est.offset;
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
        ctx.strokeStyle = '#4F6A60';
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
      }

      // ---- Steps. ----
      for (const s of stepBus.recent) {
        if (s.t < t0 || s.t > t1) continue;
        const x = xOf(s.t);
        // Coloured by timing once the beat plays: green on time, gold a bit off.
        const colour = phaseColour(sync.phaseOf.get(s));
        ctx.beginPath();
        ctx.arc(x, laneY, 10, 0, Math.PI * 2);
        if (s.inferred) {
          ctx.strokeStyle = colour;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else {
          ctx.fillStyle = colour;
          ctx.fill();
        }
      }

      // ---- "Now" line. ----
      const xn = xOf(now);
      ctx.strokeStyle = 'rgba(241, 243, 238, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xn, 0);
      ctx.lineTo(xn, h);
      ctx.stroke();
      ctx.fillStyle = '#B9C7C0';
      ctx.font = '600 14px "Atkinson Hyperlegible", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('now', xn, 18);

      // ---- Gentle hints when there is nothing to show. ----
      let hint: string | null = null;
      if (mode === 'live' && !link.conn.getSnapshot().peerConnected)
        hint = 'Waiting for the phone...';
      else if (mode === 'live' && !est) hint = 'Syncing clocks...';
      else if (stepBus.recent.length === 0 && !playing)
        hint = mode === 'tap' ? 'Press the spacebar for each step' : 'Steps will appear here';
      if (hint) {
        ctx.fillStyle = '#B9C7C0';
        ctx.font = '600 20px "Atkinson Hyperlegible", sans-serif';
        ctx.fillText(hint, w / 2, signalTop + signalH / 2);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [link, pastMs, futureMs]);

  return (
    <canvas
      ref={ref}
      className="lane"
      role="img"
      aria-label="Live timeline: the steady beat and each step, on the laptop's clock"
    />
  );
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
