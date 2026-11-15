/** Shared pieces for the patient screens: screen layout, read-aloud button, icons. */
import { useEffect, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Wordmark } from '../ui/Logo';
import { IconArrowLeft } from '../ui/icons';
import { speak, stopSpeaking } from './voice';

export const IconSpeaker = ({ size = 30 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18.2 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);
export const IconFoot = ({ size = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <ellipse cx="12" cy="9" rx="4.5" ry="6.2" />
    <circle cx="12.6" cy="19.2" r="2.8" />
  </svg>
);
export const IconList = ({ size = 28 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
);
export const IconGear = ({ size = 28 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
  </svg>
);

/** Big square "read this screen aloud" button (64px). */
export function SpeakButton({ text, dark = false }: { text: string; dark?: boolean }) {
  useEffect(() => () => stopSpeaking(), []);
  return (
    <button
      type="button"
      className={`speak${dark ? ' speak--dark' : ''}`}
      aria-label="Read this screen aloud"
      onClick={() => speak(text, true)}
    >
      <IconSpeaker />
    </button>
  );
}

interface ScreenProps {
  /** Words read aloud by the speaker button. */
  speech: string;
  /** Show a Back button (with this handler) instead of the logo. */
  onBack?: () => void;
  backLabel?: string;
  /** Small label next to Back, e.g. "Step 1 of 2". */
  crumb?: string;
  children: ReactNode;
  dark?: boolean;
}

/** One job per screen: top bar (logo or Back, plus read-aloud), then the content. */
export function Screen({ speech, onBack, backLabel = 'Back', crumb, children, dark }: ScreenProps) {
  return (
    <main className={`pt${dark ? ' pt--dark theme-dark' : ''} fade-in`}>
      <div className="pt__top">
        {onBack ? (
          <div className="pt__backrow">
            <Button variant="secondary" className="pt__back" onClick={onBack}>
              <IconArrowLeft /> {backLabel}
            </Button>
            {crumb && <span className="pt__crumb">{crumb}</span>}
          </div>
        ) : (
          <Wordmark size={36} />
        )}
        <SpeakButton text={speech} dark={dark} />
      </div>
      {children}
    </main>
  );
}
