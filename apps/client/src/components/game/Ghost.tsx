/** A small ghost, inline SVG (no asset to load): the "fooled" overlay's picture. Decorative; the text carries the meaning. */
export function Ghost({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 140"
      aria-hidden="true"
      focusable="false"
      className={`ghost-float ${className}`}
    >
      <path
        d="M60 8C33 8 14 29 14 56v66c0 6 7 9 11 5l11-11 12 12c3 3 8 3 11 0l11-12 11 12c3 3 8 3 11 0l12-12 11 11c4 4 11 1 11-5V56C106 29 87 8 60 8Z"
        fill="currentColor"
        opacity="0.92"
      />
      <ellipse cx="44" cy="58" rx="9" ry="12" fill="var(--bg)" />
      <ellipse cx="76" cy="58" rx="9" ry="12" fill="var(--bg)" />
      <ellipse cx="60" cy="88" rx="8" ry="10" fill="var(--bg)" />
    </svg>
  );
}
