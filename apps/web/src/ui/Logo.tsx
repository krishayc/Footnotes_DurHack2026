/**
 * The Footnotes mark: two footprints drawn as a pair of beamed notes (♫).
 * Each footprint = sole (note head) + heel; stems rise from the soles and one beam joins them.
 * The second print sits higher, so it reads as stepping forward.
 */
export function LogoMark({
  size = 34,
  color = 'var(--c-primary)',
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <g transform="rotate(-8 17 17)" fill={color}>
        <ellipse cx="8" cy="23" rx="4.2" ry="5.8" />
        <circle cx="8.6" cy="31" r="2.7" />
        <ellipse cx="23" cy="16" rx="4.2" ry="5.8" />
        <circle cx="23.6" cy="24" r="2.7" />
        <path
          d="M12 21.5 V6.5 M27 14.5 V2.5"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M12 6.5 L27 2.5 L27 6.8 L12 10.8 Z" />
      </g>
    </svg>
  );
}

export function Wordmark({ size = 34, color }: { size?: number; color?: string }) {
  return (
    <span className="brand" style={{ fontSize: size * 0.85 }}>
      <LogoMark size={size} color={color} />
      Footnotes
    </span>
  );
}
