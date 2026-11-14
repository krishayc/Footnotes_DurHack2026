import { useRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import './ui.css';

/** Ignore repeat taps within this window, so a tremor cannot trigger an action twice. */
export const TAP_DEBOUNCE_MS = 600;

type Variant = 'primary' | 'secondary' | 'highlight';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  hero?: boolean;
  children: ReactNode;
}

/**
 * The one button used everywhere. Big by default (84px), debounced, with a gentle
 * haptic tick where the phone supports navigator.vibrate (Android; iOS ignores it).
 */
export function Button({ variant = 'primary', hero, className = '', onClick, ...rest }: Props) {
  const lastTap = useRef(0);

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    const now = performance.now();
    if (now - lastTap.current < TAP_DEBOUNCE_MS) return;
    lastTap.current = now;
    if ('vibrate' in navigator) navigator.vibrate?.(10);
    onClick?.(e);
  }

  const cls = ['btn', `btn--${variant}`, hero ? 'btn--hero' : '', className]
    .filter(Boolean)
    .join(' ');
  return <button type="button" className={cls} onClick={handleClick} {...rest} />;
}
