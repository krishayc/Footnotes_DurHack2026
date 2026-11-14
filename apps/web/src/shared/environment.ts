import { useEffect, useState } from 'react';

/**
 * Quick checks that tell us whether this browser can do what Footnotes needs.
 * The big one: motion sensors only work in a "secure context" (HTTPS or localhost).
 */
export interface EnvCheck {
  secure: boolean;
  motionApi: boolean;
  /** iOS Safari needs DeviceMotionEvent.requestPermission() from a tap. */
  motionNeedsPermission: boolean;
  wakeLockApi: boolean;
  speechApi: boolean;
  server: 'checking' | 'ok' | 'unreachable';
}

export function useEnvironment(): EnvCheck {
  const [server, setServer] = useState<EnvCheck['server']>('checking');

  useEffect(() => {
    let cancelled = false;
    fetch('/health', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { ok?: boolean }) => !cancelled && setServer(j.ok ? 'ok' : 'unreachable'))
      .catch(() => !cancelled && setServer('unreachable'));
    return () => {
      cancelled = true;
    };
  }, []);

  const DME = typeof window !== 'undefined' ? window.DeviceMotionEvent : undefined;
  return {
    secure: window.isSecureContext,
    motionApi: !!DME,
    motionNeedsPermission:
      !!DME &&
      typeof (DME as unknown as { requestPermission?: unknown }).requestPermission === 'function',
    wakeLockApi: 'wakeLock' in navigator,
    speechApi: 'speechSynthesis' in window,
    server,
  };
}
