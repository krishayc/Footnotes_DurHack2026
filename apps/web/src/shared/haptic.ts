/**
 * A gentle buzz, where the phone supports it (Android; iPhones ignore it). Browsers only
 * allow vibration after a real tap, so we check first and never log errors.
 */
export function buzz(pattern: number | number[]) {
  const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
  if (!('vibrate' in navigator)) return;
  if (nav.userActivation && !nav.userActivation.hasBeenActive) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}
