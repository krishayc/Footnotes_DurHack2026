/**
 * Keep the phone screen on while walking.
 *
 * If the screen turns off, the browser stops sending motion events, and the music would lose
 * the walker. The Screen Wake Lock API asks the phone to stay awake. The browser drops the lock
 * whenever the page is hidden (switching apps, locking the phone), so we ask again as soon as
 * the page is visible again.
 *
 * Call `wakeLock.enable()` directly from a tap: some browsers (Safari) only grant it in
 * response to a user action.
 *
 * Support: Chrome on Android, Safari on iOS 16.4+. Elsewhere we show "keep the screen on".
 */
import { useSyncExternalStore } from 'react';

export type WakeLockState = 'off' | 'on' | 'unsupported' | 'error';

class WakeLockKeeper {
  private state: WakeLockState =
    typeof navigator !== 'undefined' && 'wakeLock' in navigator ? 'off' : 'unsupported';
  private wanted = false;
  private sentinel: WakeLockSentinel | null = null;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.state;

  enable() {
    if (this.state === 'unsupported') return;
    if (!this.wanted) {
      this.wanted = true;
      document.addEventListener('visibilitychange', this.onVisibility);
      // Some phones only grant the lock from a tap: try again on any tap while it's off.
      document.addEventListener('pointerdown', this.onTap, { passive: true });
    }
    void this.request();
  }

  disable() {
    this.wanted = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('pointerdown', this.onTap);
    void this.sentinel?.release();
    this.sentinel = null;
    if (this.state !== 'unsupported') this.set('off');
  }

  private onTap = () => {
    if (this.wanted && this.state !== 'on') void this.request();
  };

  private onVisibility = () => {
    if (this.wanted && document.visibilityState === 'visible') void this.request();
  };

  private async request() {
    if (this.sentinel && !this.sentinel.released) return;
    try {
      const s = await navigator.wakeLock.request('screen');
      if (!this.wanted) {
        void s.release();
        return;
      }
      this.sentinel = s;
      this.set('on');
      s.addEventListener('release', () => {
        this.sentinel = null;
        if (this.state === 'on') this.set('off');
        // The phone can drop the lock by itself (battery saver, a system dialog). If the page
        // is still on screen, ask again straight away.
        if (this.wanted && document.visibilityState === 'visible') void this.request();
      });
    } catch {
      // e.g. battery saver on, or the request did not come from a tap.
      this.set('error');
    }
  }

  private set(s: WakeLockState) {
    this.state = s;
    for (const fn of this.listeners) fn();
  }
}

export const wakeLock = new WakeLockKeeper();

export function useWakeLock(): WakeLockState {
  return useSyncExternalStore(wakeLock.subscribe, wakeLock.getSnapshot);
}
