/**
 * Did the phone's screen switch off (or the page get hidden) while it was meant to be
 * counting steps? When the screen is off, the phone pauses the page: no motion sensor, no
 * steps, no messages. We can't stop that from inside a web page, but we can notice it
 * afterwards and say so plainly, so the walker knows why steps went missing.
 */
import { Store } from '../shared/store';

export const screenWatch = new Store<{ lastOffMs: number | null; at: number }>({
  lastOffMs: null,
  at: 0,
});

let hiddenAt: number | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = performance.now();
    else if (hiddenAt !== null) {
      const off = performance.now() - hiddenAt;
      hiddenAt = null;
      if (off > 2000) screenWatch.set({ lastOffMs: off, at: performance.now() });
    }
  });
}
