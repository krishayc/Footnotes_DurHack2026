/**
 * Warns when the phone's screen may switch off (or just did). A switched-off screen pauses
 * the page, so steps stop being counted: the most common reason for "it stopped registering".
 */
import { useStore } from '../shared/store';
import { useWakeLock } from '../sensor/wakeLock';
import { screenWatch } from '../sensor/screenWatch';

const FIX =
  'On iPhone: Settings → Display & Brightness → Auto-Lock → Never, and turn off Low Power Mode.';

export function ScreenWarning({ dark = false }: { dark?: boolean }) {
  const lock = useWakeLock();
  const { lastOffMs, at } = useStore(screenWatch);
  const recentOff = lastOffMs !== null && performance.now() - at < 60_000;
  if (!recentOff && lock === 'on') return null;
  return (
    <p className={`pt__note pt__warn${dark ? ' pt__warn--dark' : ''}`} role="alert">
      {recentOff
        ? `Your screen switched off for ${Math.round(lastOffMs! / 1000)} seconds, so steps weren't counted then. `
        : 'Your screen might switch off in your pocket, which stops the step counting. '}
      {FIX}
    </p>
  );
}
