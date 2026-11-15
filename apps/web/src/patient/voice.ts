/**
 * Spoken words and gentle sounds on the phone.
 *  - speak(): Web Speech API, only if voice guidance is on (or `force` for the read-aloud
 *    button, which the person explicitly pressed).
 *  - chime(): a soft two-note chime (key moments: calibration done).
 * Audio on phones only works after a tap, so unlockAudio() is called from the first tap.
 */
import { prefs } from './prefs';

let ctx: AudioContext | null = null;

export function unlockAudio() {
  try {
    if (!ctx) {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx();
    }
    void ctx.resume();
  } catch {
    /* no audio: fine */
  }
}

export function speak(text: string, force = false) {
  if (!('speechSynthesis' in window)) return;
  if (!force && !prefs.get().voice) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB';
  u.rate = 0.9; // a little slower than default: calm, easy to follow
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/** Soft chime: D5 then A5, sine, gentle envelope, quiet. */
export function chime() {
  if (!ctx) return;
  const now = ctx.currentTime;
  [587.33, 880].forEach((f, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    const t = now + i * 0.18;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    o.connect(g).connect(ctx!.destination);
    o.start(t);
    o.stop(t + 1.3);
  });
}

/** Play notes (Hz) one after another, softly. Used by "Hear my walk". */
export function playNotes(freqs: (number | null)[], stepS = 0.28) {
  if (!ctx) return;
  const start = ctx.currentTime + 0.1;
  freqs.forEach((f, i) => {
    if (f === null) return;
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    const t = start + i * stepS;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + stepS * 2.2);
    o.connect(g).connect(ctx!.destination);
    o.start(t);
    o.stop(t + stepS * 2.4);
  });
  return (freqs.length * stepS + 0.6) * 1000;
}
