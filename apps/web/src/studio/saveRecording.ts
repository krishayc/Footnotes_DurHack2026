/**
 * "Save the last minute for tuning": the phone already streams its raw accelerometer to the
 * laptop, so the Studio can save the last 60 s of real walking (plus the steps the phone
 * detected and the beats that played) without anyone touching the phone. The server writes
 * recordings/walk-<time>.json; `npm run analyze -- <file>` replays it.
 */
import { audio } from './audio/engine';
import type { StudioLink } from './link';
import { session } from './session';

const WINDOW_MS = 60_000;

export async function saveLastMinute(link: StudioLink): Promise<string> {
  const latest = link.accel.latestTime();
  if (latest === null) return 'No walking data from the phone yet.';
  const since = latest - WINDOW_MS;
  const samples: [number, number, number, number][] = [];
  link.accel.forEachSince(since, (i) =>
    samples.push([link.accel.t[i], link.accel.x[i], link.accel.y[i], link.accel.z[i]]),
  );
  const off = link.clock.current?.offset ?? 0; // phone - laptop
  const phone = link.getSnapshot().phone;
  const body = {
    recordedAt: new Date().toISOString(),
    source: 'studio',
    device: 'phone stream, saved on the laptop',
    rateHz: phone?.rateHz ?? 0,
    settings: { legMode: phone?.legMode ?? 'both' },
    oneLegAtEnd: phone?.oneLeg ?? false,
    cadenceAtEnd: phone?.cadenceSpm ?? null,
    tempo: session.state.get().tempo,
    samples,
    // Everything in the PHONE's clock, so it lines up with the samples.
    steps: link.steps
      .filter((s) => s.phoneT >= since)
      .map((s) => ({ t: s.phoneT, inferred: s.inferred })),
    beats: audio.beats.map((b) => b.t + off).filter((t) => t >= since && t <= latest),
  };
  try {
    const res = await fetch('/api/recordings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = (await res.json()) as { name?: string; error?: string };
    if (!res.ok || !j.name) return `Could not save: ${j.error ?? res.status}`;
    return `Saved recordings/${j.name} (${Math.round(samples.length / 60)} s of walking, ${body.steps.length} steps).`;
  } catch {
    return 'Could not reach the server to save.';
  }
}
