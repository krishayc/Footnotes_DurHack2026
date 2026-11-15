/** Walking (dark, pocket-safe), End your walk?, After the walk, My walks, Settings. */
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { OFFSET_MAX, OFFSET_MIN } from '@footnotes/shared';
import { Button } from '../ui/Button';
import { useStore } from '../shared/store';
import { sendWalkCommand, walk } from '../sensor/link';
import { useSteps } from '../sensor/steps';
import {
  dayLabel,
  minutesWords,
  pauseWords,
  timingWords,
  walkLine,
  walks,
  type Walk,
} from './history';
import { prefs } from './prefs';
import { BeatPulse, type Go } from './setup';
import { StaffPicture } from './StaffPicture';
import { Screen, SpeakButton } from './ui';
import { chime, playNotes, speak } from './voice';
import { finishWalk, isPaused, startWalk, walkSeconds } from './walkSession';
import { buzz } from '../shared/haptic';

const ALL_LAYERS = ['Shakers', 'Bass', 'Keys', 'Melody', 'Sparkle'];
const DIM_AFTER_MS = 90_000;

// ---------------------------------------------------------------- Walking

export function Walking({ go }: { go: Go }) {
  const { state: st } = useStore(walk);
  const p = useStore(prefs);
  const s = useSteps();
  const [, tick] = useState(0);
  const [hold, setHold] = useState(0);
  const [dim, setDim] = useState(false);
  const holdStart = useRef<number | null>(null);
  const raf = useRef(0);
  const lastTouch = useRef(performance.now());

  useEffect(() => {
    startWalk();
    speak('Walk along to the beat.');
    if (!st?.layersOn && st?.phase === 'ready') sendWalkCommand('startBeat');
    const id = window.setInterval(() => {
      tick((n) => n + 1);
      setDim(performance.now() - lastTouch.current > DIM_AFTER_MS);
    }, 1000);
    return () => {
      window.clearInterval(id);
      cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Make sure the beat is playing (e.g. if Step 2 was skipped).
  useEffect(() => {
    if (st && st.audioOn && st.phase === 'ready') sendWalkCommand('startBeat');
  }, [st?.audioOn, st?.phase, st]);

  // Press and hold anywhere to stop. Quick taps and pocket bumps do nothing.
  const begin = (e: PointerEvent) => {
    e.preventDefault();
    lastTouch.current = performance.now();
    setDim(false);
    holdStart.current = performance.now();
    const loop = () => {
      if (holdStart.current === null) return;
      const v = Math.min(1, (performance.now() - holdStart.current) / p.holdMs);
      setHold(v);
      if (v >= 1) {
        holdStart.current = null;
        setHold(0);
        buzz(30);
        go('end');
        return;
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };
  const end = () => {
    holdStart.current = null;
    cancelAnimationFrame(raf.current);
    setHold(0);
  };

  const mins = Math.floor(walkSeconds() / 60);
  const paused = isPaused();
  const score = st?.score ?? 0;
  const status = paused
    ? 'Paused. The music will help you restart.'
    : score >= 0.6
      ? 'In step'
      : 'Finding the beat';
  const fresh = s.lastStepAt !== null && performance.now() - s.lastStepAt < 3000;
  const on = st?.layersOn ?? [];
  const R = 34;
  const C = 2 * Math.PI * R;

  return (
    <div
      className={`walk${dim ? ' walk--dim' : ''}`}
      onPointerDown={begin}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
      onContextMenu={(e) => e.preventDefault()}
      role="application"
      aria-label={`Walking. ${status}. Press and hold anywhere to stop.`}
    >
      <div className="walk__top">
        <p className="walk__time">Walking · {mins < 1 ? 'just started' : `${mins} min`}</p>
        <div onPointerDown={(e) => e.stopPropagation()}>
          <SpeakButton
            dark
            text={`${status}. ${fresh && s.cadenceSpm ? `${Math.round(s.cadenceSpm)} steps a minute.` : ''} Playing now: Beat${on.length ? ', ' + on.join(', ') : ''}. Press and hold anywhere to stop.`}
          />
        </div>
      </div>
      <p className="walk__sound">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
          <rect x="3" y="14" width="4" height="6" rx="1.5" />
          <rect x="17" y="14" width="4" height="6" rx="1.5" />
        </svg>
        {st?.audioOn ? 'Music playing' : 'Waiting for the music'}
      </p>

      <div className="walk__centre">
        <BeatPulse size={200} dark />
        <p className="walk__status" aria-live="polite">
          {status}
        </p>
        <p className="walk__pace">
          {fresh && s.cadenceSpm ? `${Math.round(s.cadenceSpm)} steps a minute` : ' '}
        </p>
      </div>

      <div className="walk__chips">
        <p className="walk__chipslabel">Playing now</p>
        <ul className="chips chips--walk">
          <li className="chip chip--on">Beat</li>
          {ALL_LAYERS.map((name) =>
            on.includes(name) ? (
              <li key={name} className="chip chip--on">
                {name}
              </li>
            ) : st?.nextLayer === name ? (
              <li key={name} className="chip chip--soon">
                {name}, soon
              </li>
            ) : null,
          )}
        </ul>
      </div>

      <div className="walk__hold">
        <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
          <circle cx="42" cy="42" r={R} stroke="#2F4840" strokeWidth="7" fill="none" />
          <circle
            cx="42"
            cy="42"
            r={R}
            stroke="#F2B544"
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - hold)}
            transform="rotate(-90 42 42)"
          />
        </svg>
        <p className="walk__holdtext">
          {hold > 0 ? 'Keep holding...' : 'Press and hold anywhere to stop'}
        </p>
        <p className="walk__hint">Quick taps and pocket bumps are ignored</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- End your walk?

export function EndConfirm({ go }: { go: Go }) {
  // Nothing pressed for 10 s: go back to walking, with a soft chime so it's never silent.
  useEffect(() => {
    speak('End your walk?');
    const t = window.setTimeout(() => {
      chime();
      go('walking');
    }, 10_000);
    return () => window.clearTimeout(t);
  }, [go]);
  return (
    <Screen speech="End your walk? Press Yes, I'm done, or Keep walking." dark>
      <section className="pt__intro">
        <h1>End your walk?</h1>
        <p className="pt__lead">If you don&apos;t choose, we&apos;ll keep walking in 10 seconds.</p>
      </section>
      <div className="pt__actions">
        <Button
          hero
          variant="highlight"
          onClick={() => {
            sendWalkCommand('stopBeat');
            const w = finishWalk();
            go('after', w?.id);
          }}
        >
          Yes, I&apos;m done
        </Button>
        <Button hero variant="secondary" onClick={() => go('walking')}>
          Keep walking
        </Button>
      </div>
    </Screen>
  );
}

// ---------------------------------------------------------------- After the walk

const PENTA = [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99]; // D major pentatonic

export function After({ go, id }: { go: Go; id?: string }) {
  const { list } = useStore(walks);
  const w = (id ? list.find((x) => x.id === id) : undefined) ?? list[0];
  const svgRef = useRef<SVGSVGElement>(null);
  const [playing, setPlaying] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  if (!w) {
    return (
      <Screen
        speech="That was a short walk. Walks longer than 10 seconds are saved."
        onBack={() => go('home')}
      >
        <section className="pt__intro">
          <h1>That was a short one</h1>
          <p className="pt__lead">Walks longer than 10 seconds are saved here as music.</p>
        </section>
        <Button onClick={() => go('home')}>Done</Button>
      </Screen>
    );
  }

  const hear = () => {
    const step = Math.max(1, Math.ceil(w.points.length / 32));
    const notes = w.points
      .filter((_, i) => i % step === 0)
      .map((pt) => (pt.paused ? null : PENTA[Math.round(pt.score * (PENTA.length - 1))]));
    setPlaying(true);
    const ms = playNotes(notes) ?? 0;
    window.setTimeout(() => setPlaying(false), ms);
  };

  const speech = `${dayLabel(w.startedAt)}. That was a lovely walk. Walked for ${minutesWords(w.durationS)}. Timing: ${timingWords(w.points)}. Pauses: ${pauseWords(w.points)}.`;
  return (
    <Screen speech={speech} onBack={() => go('home')} backLabel="Home">
      <section className="pt__intro">
        <p className="pt__crumb">{dayLabel(w.startedAt)}</p>
        <h1>That was a lovely walk.</h1>
      </section>
      <figure className="pt__score">
        <StaffPicture
          ref={svgRef}
          points={w.points}
          label="Your walk drawn as music"
          height={130}
        />
        <figcaption>
          Your walk, as music.{' '}
          {w.points.some((p) => p.paused)
            ? 'The gap is where you paused.'
            : 'Higher dots are where you were in step.'}
        </figcaption>
      </figure>
      <dl className="card pt__stats">
        <div>
          <dt>Walked for</dt>
          <dd>{minutesWords(w.durationS)}</dd>
        </div>
        <div>
          <dt>Timing</dt>
          <dd>{timingWords(w.points)}</dd>
        </div>
        <div>
          <dt>Pauses</dt>
          <dd>{pauseWords(w.points)}</dd>
        </div>
      </dl>
      <Button onClick={hear} disabled={playing}>
        {playing ? 'Playing your walk...' : 'Hear my walk'}
      </Button>
      <div className="pt__pair">
        <Button
          variant="secondary"
          onClick={() => void sharePicture(w, svgRef.current).then(setSent)}
        >
          Send to physio
        </Button>
        <Button variant="secondary" onClick={() => go('home')}>
          Done
        </Button>
      </div>
      {sent && (
        <p className="pt__note" role="status">
          {sent}
        </p>
      )}
    </Screen>
  );
}

/** Make a simple summary picture (PNG) and share it, or download it if sharing isn't available. */
async function sharePicture(w: Walk, svg: SVGSVGElement | null): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#F1F3EE';
  ctx.fillRect(0, 0, 1080, 720);
  ctx.fillStyle = '#18211E';
  ctx.font = '700 52px "Bricolage Grotesque", sans-serif';
  ctx.fillText('Footnotes: walk summary', 60, 100);
  ctx.font = '32px "Atkinson Hyperlegible", sans-serif';
  const lines = [
    `${dayLabel(w.startedAt)} (${new Date(w.startedAt).toLocaleString('en-GB')})`,
    `Walked for: ${minutesWords(w.durationS)}`,
    `Steps: ${w.steps}   Beat: ${w.tempo} steps a minute`,
    `Timing: ${timingWords(w.points)}`,
    `Pauses: ${pauseWords(w.points)}`,
  ];
  lines.forEach((l, i) => ctx.fillText(l, 60, 170 + i * 48));
  if (svg) {
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    await img.decode().catch(() => undefined);
    ctx.fillStyle = '#13201C';
    ctx.fillRect(60, 430, 960, 240);
    ctx.drawImage(img, 80, 445, 920, 210);
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) return 'Sorry, the picture could not be made.';
  const file = new File([blob], 'footnotes-walk.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'My walk' });
      return 'Shared.';
    } catch {
      return 'Not shared.';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'footnotes-walk.png';
  a.click();
  return 'Saved a picture of your walk.';
}

// ---------------------------------------------------------------- My walks

export function MyWalks({ go }: { go: Go }) {
  const { list } = useStore(walks);
  const speech = list.length
    ? `My walks. ${list.length} walks. ${list
        .slice(0, 3)
        .map((w) => `${dayLabel(w.startedAt)}: ${walkLine(w)}`)
        .join(' ')}`
    : 'My walks. No walks yet. Your walks will appear here.';
  return (
    <Screen speech={speech} onBack={() => go('home')}>
      <section className="pt__intro">
        <h1>My walks</h1>
      </section>
      {list.length === 0 ? (
        <div className="card pt__last">
          <span className="pt__lastline">
            No walks yet. After your first walk it will appear here, drawn as music.
          </span>
        </div>
      ) : (
        <ul className="pt__list">
          {list.map((w) => (
            <li key={w.id}>
              <button type="button" className="card pt__last" onClick={() => go('after', w.id)}>
                <span className="pt__lastlabel">{dayLabel(w.startedAt)}</span>
                <span className="pt__staff">
                  <StaffPicture
                    points={w.points}
                    dark={false}
                    height={64}
                    label={`Walk on ${dayLabel(w.startedAt)} as music`}
                  />
                </span>
                <span className="pt__lastline">{walkLine(w)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------- Settings

export function Settings({ go, onDeveloper }: { go: Go; onDeveloper: () => void }) {
  const p = useStore(prefs);
  const taps = useRef<number[]>([]);
  const pct = Math.round(p.offset * 100);
  const setOffset = (v: number) => {
    const o = Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, v));
    prefs.set({ offset: o });
    sendWalkCommand('setOffset', o);
  };
  const speech = `Settings. Beat above your pace: ${pct} percent. Voice guidance ${p.voice ? 'on' : 'off'}. Text size ${p.textSize === 'xl' ? 'extra large' : 'large'}. Hold to stop: ${p.holdMs / 1000} seconds.`;
  return (
    <Screen speech={speech} onBack={() => go('home')}>
      <section className="pt__intro">
        <h1>Settings</h1>
      </section>

      <section className="card pt__setting" aria-labelledby="set-off">
        <h2 id="set-off">Beat above your pace</h2>
        <div className="stepper">
          <Button variant="secondary" onClick={() => setOffset(p.offset - 0.01)} aria-label="Less">
            −
          </Button>
          <p className="stepper__value" aria-live="polite">
            +{pct}%
          </p>
          <Button variant="secondary" onClick={() => setOffset(p.offset + 0.01)} aria-label="More">
            +
          </Button>
        </div>
        <p className="pt__note">How much quicker than your natural pace the beat is.</p>
      </section>

      <Choice
        title="Voice guidance"
        value={p.voice ? 'on' : 'off'}
        options={[
          ['on', 'On'],
          ['off', 'Off'],
        ]}
        onChange={(v) => prefs.set({ voice: v === 'on' })}
      />
      <Choice
        title="Text size"
        value={p.textSize}
        options={[
          ['large', 'Large'],
          ['xl', 'Extra large'],
        ]}
        onChange={(v) => prefs.set({ textSize: v as 'large' | 'xl' })}
      />
      <Choice
        title="Hold to stop"
        value={String(p.holdMs)}
        options={[
          ['1500', '1.5 s'],
          ['2000', '2 s'],
          ['3000', '3 s'],
        ]}
        onChange={(v) => prefs.set({ holdMs: Number(v) })}
      />

      <button
        type="button"
        className="pt__version"
        onClick={() => {
          const now = performance.now();
          taps.current = [...taps.current.filter((t) => now - t < 3000), now];
          if (taps.current.length >= 5) {
            taps.current = [];
            onDeveloper();
          }
        }}
      >
        Footnotes 0.7 · DurHack 2026
      </button>
    </Screen>
  );
}

function Choice({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <section className="card pt__setting" aria-label={title}>
      <h2>{title}</h2>
      <div className="seg seg--big" role="group" aria-label={title}>
        {options.map(([v, label]) => (
          <button
            key={v}
            type="button"
            className="seg__btn"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
