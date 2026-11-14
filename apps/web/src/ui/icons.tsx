/** Simple stroke icons: 2.2px stroke, rounded caps, inherit currentColor. No emoji anywhere. */
import type { SVGProps } from 'react';

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
});

export const IconPlay = ({ size = 32 }) => (
  <svg {...base(size)}>
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
  </svg>
);
export const IconPhone = ({ size = 32 }) => (
  <svg {...base(size)}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
    <path d="M10.5 18.5h3" />
  </svg>
);
export const IconLaptop = ({ size = 32 }) => (
  <svg {...base(size)}>
    <rect x="4" y="4.5" width="16" height="11" rx="1.8" />
    <path d="M2 19.5h20" />
  </svg>
);
export const IconArrowLeft = ({ size = 28 }) => (
  <svg {...base(size)}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
export const IconArrowRight = ({ size = 28 }) => (
  <svg {...base(size)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const IconCheck = ({ size = 24 }) => (
  <svg {...base(size)}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const IconInfo = ({ size = 24 }) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.6v.1" />
  </svg>
);
