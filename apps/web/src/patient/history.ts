/**
 * Walk history, kept on the phone (localStorage for the hackathon). Each walk keeps a small
 * timeline (one point every 2 s) so it can be drawn as music afterwards.
 */
import { Store, loadJSON, saveJSON } from '../shared/store';

export interface WalkPoint {
  /** Seconds since the walk started. */
  t: number;
  /** In-step score 0..1. */
  score: number;
  /** No steps for 3 s or more. */
  paused: boolean;
  /** How many music layers were playing (0 = just the beat). */
  layers: number;
}

export interface Walk {
  id: string;
  startedAt: string; // ISO
  durationS: number;
  steps: number;
  tempo: number;
  points: WalkPoint[];
}

const KEY = 'footnotes.walks.v1';
export const walks = new Store<{ list: Walk[] }>(loadJSON(KEY, { list: [] as Walk[] }));

export function saveWalk(w: Walk) {
  const list = [w, ...walks.get().list].slice(0, 50);
  walks.set({ list });
  saveJSON(KEY, { list });
}

/** Number of separate pauses (a run of paused points counts once). */
export function countPauses(points: WalkPoint[]): number {
  let n = 0;
  for (let i = 0; i < points.length; i++) if (points[i].paused && !points[i - 1]?.paused) n++;
  return n;
}

export function averageScore(points: WalkPoint[]): number {
  const moving = points.filter((p) => !p.paused);
  return moving.length ? moving.reduce((a, p) => a + p.score, 0) / moving.length : 0;
}

/** Kind, plain words about the timing. Never "bad" or "failed". */
export function timingWords(points: WalkPoint[]): string {
  const a = averageScore(points);
  if (a >= 0.75) return 'Mostly in step';
  if (a >= 0.5) return 'In step a good part of the time';
  if (a >= 0.25) return 'Finding the beat';
  return 'Getting used to the beat';
}

export function pauseWords(points: WalkPoint[]): string {
  const n = countPauses(points);
  if (n === 0) return 'None';
  return `${n}, then back on track`;
}

export function minutesWords(s: number): string {
  if (s < 60) return `${Math.max(1, Math.round(s))} seconds`;
  const m = Math.round(s / 60);
  return `${m} minute${m === 1 ? '' : 's'}`;
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** One plain line for a walk card. */
export function walkLine(w: Walk): string {
  const timing = timingWords(w.points).toLowerCase();
  return `${minutesWords(w.durationS)}. ${timing.charAt(0).toUpperCase()}${timing.slice(1)}.`;
}
