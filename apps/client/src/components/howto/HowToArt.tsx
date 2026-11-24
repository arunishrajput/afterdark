import type { ArtId } from './howToPlayContent';

const STROKE = 'currentColor';

/** Small line pictures, inline SVG: nothing to load, colours from the theme. Decorative (the text carries the meaning). */
export function HowToArt({ id }: { id: ArtId }) {
  return (
    <svg
      viewBox="0 0 240 110"
      aria-hidden="true"
      focusable="false"
      className="h-auto w-full rounded-xl bg-bg/60 text-muted"
      fill="none"
      stroke={STROKE}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {id === 'goal' && (
        <>
          <path d="M20 90 L20 20 L120 12 L220 24 L220 94 L120 86 Z" opacity="0.5" />
          <path d="M70 18 L70 88 M120 12 L120 86 M170 20 L170 90" opacity="0.25" />
          <path
            d="M120 32 a14 14 0 1 1 0.1 0 Z M120 46 L120 62"
            stroke="var(--accent)"
            strokeWidth="3"
          />
          <circle cx="120" cy="32" r="5" fill="var(--accent)" stroke="none" />
          <circle cx="52" cy="60" r="5" fill={STROKE} stroke="none" />
          <circle cx="190" cy="68" r="5" fill={STROKE} stroke="none" />
          <circle cx="160" cy="44" r="5" fill={STROKE} stroke="none" />
        </>
      )}
      {id === 'tasks' && (
        <>
          <path d="M30 78 C70 78 80 36 120 36 S170 70 200 52" strokeDasharray="2 8" opacity="0.7" />
          <circle cx="34" cy="78" r="6" fill={STROKE} stroke="none" />
          <path
            d="M200 52 m-9 -18 a12 12 0 1 1 18 0 L200 58 Z"
            stroke="var(--accent)"
            strokeWidth="3"
          />
          <circle cx="200" cy="30" r="4" fill="var(--accent)" stroke="none" />
          <circle cx="200" cy="52" r="17" stroke="var(--accent)" opacity="0.4" />
          <path d="M96 94 l12 -8 l-12 -8" />
        </>
      )}
      {id === 'infection' && (
        <>
          <circle cx="62" cy="52" r="10" fill={STROKE} stroke="none" />
          <circle cx="104" cy="52" r="10" stroke="var(--danger)" strokeDasharray="3 4" />
          {/* Not `--infected`: it is transparent outside the imposter theme, and this art shows on Home and in the lobby. */}
          <circle cx="146" cy="52" r="10" fill="var(--danger)" stroke="none" />
          <circle cx="188" cy="52" r="10" fill={STROKE} stroke="none" />
          <path d="M72 52 L92 52" stroke="var(--danger)" opacity="0.8" />
          <g transform="translate(60 82)">
            {[0, 1, 2, 3, 4].map((i) => (
              <rect
                key={i}
                x={i * 26}
                width="18"
                height="12"
                rx="3"
                fill={i < 2 ? 'var(--danger)' : 'none'}
                stroke={i < 2 ? 'none' : STROKE}
              />
            ))}
          </g>
        </>
      )}
      {id === 'meetings' && (
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2;
            return (
              <circle
                key={i}
                cx={90 + Math.cos(a) * 42}
                cy={55 + Math.sin(a) * 36}
                r="8"
                fill={STROKE}
                stroke="none"
                opacity={0.8}
              />
            );
          })}
          <circle cx="90" cy="55" r="6" stroke="var(--accent)" strokeWidth="3" />
          <rect x="164" y="26" width="52" height="60" rx="8" />
          <path d="M174 44 L206 44 M174 56 L206 56" opacity="0.5" />
          <path d="M178 72 l8 8 l16 -16" stroke="var(--accent)" strokeWidth="3" />
        </>
      )}
      {id === 'safety' && (
        <>
          <path
            d="M120 12 L170 28 L170 58 C170 80 148 94 120 102 C92 94 70 80 70 58 L70 28 Z"
            stroke="var(--accent)"
            strokeWidth="3"
          />
          <path d="M98 56 l16 16 l30 -32" stroke="var(--accent)" strokeWidth="4" />
          <path d="M26 96 L214 96" opacity="0.35" strokeDasharray="10 8" />
        </>
      )}
    </svg>
  );
}
