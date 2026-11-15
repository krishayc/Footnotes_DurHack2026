/**
 * Freeze watch panel: a live line graph of the freeze index with a dashed alert line, what
 * the music is doing, the Simulate freeze button, and the experimental live-phone switch.
 */
import { useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { useStore } from '../shared/store';
import { audio } from './audio/engine';
import { freezeWatch } from './freeze';
import { arranger } from './music/arranger';
import { stepBus } from './steps';

const SPAN_MS = 30_000;

export function FreezePanel() {
  const f = useStore(freezeWatch.state);
  const { recovering } = useStore(arranger.state);
  const { playing } = useStore(audio.state);
  const { mode } = useStore(stepBus.settings);

  const status = recovering
    ? 'Recovery motif playing'
    : f.freezing
      ? playing
        ? 'Freeze detected: recovery starts on the next beat'
        : 'Freeze detected (start the beat to hear recovery)'
      : 'Clear';

  return (
    <section className={`panel freeze${recovering ? ' freeze--on' : ''}`} aria-labelledby="fz-h">
      <div className="freeze__head">
        <h2 id="fz-h" className="panel__h">
          Freeze watch
        </h2>
        <span className="freeze__status" role="status">
          {status}
        </span>
      </div>
      <FreezeGraph />
      <p className="panel__p panel__p--sm">
        Freeze index = shaking power (3–8 Hz) ÷ walking power (0.5–3 Hz).{' '}
        {f.source === 'replay'
          ? 'From the recording being replayed.'
          : mode === 'live'
            ? 'From the phone: experimental, see Under the hood.'
            : 'Live index needs the phone (Live phone mode).'}
      </p>
      <div className="pair">
        <Button
          variant={f.simulated ? 'highlight' : 'secondary'}
          onClick={() => freezeWatch.setSimulated(!f.simulated)}
        >
          {f.simulated ? 'End the freeze' : 'Simulate freeze'}
        </Button>
      </div>
      {mode === 'live' && (
        <label className="check">
          <input
            type="checkbox"
            checked={f.liveDrivesMusic}
            onChange={(e) => freezeWatch.setLiveDrivesMusic(e.target.checked)}
          />
          Let the phone&apos;s freeze index change the music (experimental, many false alarms)
        </label>
      )}
    </section>
  );
}

/** Canvas line graph of the last 30 s of the freeze index, dashed line at the threshold. */
function FreezeGraph() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { thresholds } = freezeWatch.state.get();
      const now = performance.now();
      const X = (t: number) => w - ((now - t) / SPAN_MS) * w;
      const top = 3 * thresholds.fi;
      const Y = (fi: number) => h - 4 - (Math.min(fi, top) / top) * (h - 10);

      // Freeze stretches as a soft band.
      const hist = freezeWatch.history;
      ctx.fillStyle = 'rgba(156, 199, 224, 0.18)';
      for (let i = 0; i < hist.length; i++) {
        if (!hist[i].freezing) continue;
        const x0 = X(hist[i].laptopT - 500);
        const x1 = X(hist[i].laptopT);
        ctx.fillRect(x0, 0, x1 - x0 + 1, h);
      }

      // Dashed alert line.
      ctx.strokeStyle = '#E7C98B';
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, Y(thresholds.fi));
      ctx.lineTo(w, Y(thresholds.fi));
      ctx.stroke();
      ctx.setLineDash([]);

      // The index; dimmed where there's too little movement to count (standing still).
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      for (let i = 1; i < hist.length; i++) {
        const a = hist[i - 1];
        const b = hist[i];
        if (b.laptopT - a.laptopT > 2000 || b.laptopT < now - SPAN_MS) continue;
        ctx.strokeStyle = b.totalPower > thresholds.power ? '#9CC7E0' : '#4F6A60';
        ctx.beginPath();
        ctx.moveTo(X(a.laptopT), Y(a.fi));
        ctx.lineTo(X(b.laptopT), Y(b.fi));
        ctx.stroke();
      }
      ctx.fillStyle = '#B9C7C0';
      ctx.font = '600 12px "Atkinson Hyperlegible", sans-serif';
      ctx.fillText(`alert ${thresholds.fi.toFixed(2)}`, 6, Y(thresholds.fi) - 5);
      if (hist.length === 0) {
        ctx.textAlign = 'center';
        ctx.fillText('No signal yet', w / 2, h / 2);
        ctx.textAlign = 'left';
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={ref}
      className="freeze__graph"
      role="img"
      aria-label="Freeze index over the last 30 seconds, with the alert threshold as a dashed line"
    />
  );
}
