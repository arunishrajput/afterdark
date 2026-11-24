import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Home's night map, beside the logo on a laptop: a dark street map seen from above, like the
 * game's own map. The host's drawn area (with its corner handles), three task pins, the Base, and
 * six players walking. One of them is being tailed by an Imposter who looks like everyone else; the
 * dashed red ring is the "exposed" mark only Imposters see in a real game. Inline SVG with SMIL
 * motion: nothing to load, and it stands still when the player asks for less motion. Decorative
 * (ADR-110, ADR-111).
 */

type Point = readonly [number, number];

interface Walker {
  /** Route, inside the drawn area. */
  path: string;
  /** Seconds per lap: a slow walk. */
  dur: number;
  /** Start this many seconds into the lap, so the players are spread out. */
  offset: number;
  /** Where the dot stands when motion is reduced. */
  still: Point;
  /** Walk the route there and back instead of round. */
  back?: boolean;
  /** Wears the dashed "exposed" ring. */
  exposed?: boolean;
}

const TAILED = 'M 60 186 L 104 112 L 236 96 L 248 188 L 120 214 Z';

const WALKERS: readonly Walker[] = [
  { path: 'M 70 150 L 150 136 L 158 226 L 76 236 Z', dur: 40, offset: 6, still: [110, 143] },
  { path: 'M 150 96 L 280 78 L 300 150 L 172 166 Z', dur: 48, offset: 30, still: [215, 87] },
  {
    path: 'M 196 206 C 236 196 290 186 318 168 L 290 246 L 192 254 Z',
    dur: 44,
    offset: 14,
    still: [241, 250],
  },
  { path: 'M 80 252 L 280 236', dur: 56, offset: 20, still: [180, 244], back: true },
  // The tailed player, then the Imposter 1.5 s behind on the same route.
  { path: TAILED, dur: 60, offset: 22, still: [170, 104], exposed: true },
  { path: TAILED, dur: 60, offset: 20.5, still: [158, 105.5] },
];

const AREA: readonly Point[] = [
  [52, 74],
  [298, 44],
  [356, 150],
  [304, 262],
  [88, 276],
  [34, 178],
];
const AREA_PATH = `M ${AREA.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;

const TASKS: readonly Point[] = [
  [98, 120],
  [258, 90],
  [240, 228],
];

const MAJOR_ROADS = [
  'M -10 196 C 90 178 170 214 260 190 S 360 148 410 156',
  'M 168 -10 C 176 70 150 150 178 330',
];
const STREETS = [
  'M -10 92 L 410 58',
  'M -10 140 L 410 108',
  'M -10 250 L 410 226',
  'M 62 -10 L 44 330',
  'M 112 -10 L 100 330',
  'M 236 -10 L 262 330',
  'M 300 -10 L 330 330',
  'M 356 -10 L 384 330',
];

/** The game's radar-dot grey (index.css `.radar-dot`). */
const DOT = '#cfd3dc';
/** Darkened-map water, as the dark tiles render it. */
const WATER = '#0c1424';

export function NightScene({ className = '' }: { className?: string }) {
  const still = useReducedMotion();
  return (
    <svg
      viewBox="0 0 400 320"
      aria-hidden="true"
      focusable="false"
      className={className}
      data-testid="night-scene"
      fill="none"
    >
      <defs>
        <radialGradient id="ad-hero-fade-fill" cx="0.5" cy="0.54" r="0.6">
          <stop offset="0.42" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <mask id="ad-hero-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="320">
          <rect width="400" height="320" fill="url(#ad-hero-fade-fill)" />
        </mask>
      </defs>

      {/* The map itself fades into the night at its edges. Static, so the mask is drawn once. */}
      <g mask="url(#ad-hero-fade)" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M -10 300 C 60 270 120 300 200 285 S 330 250 410 262"
          stroke={WATER}
          strokeWidth="24"
        />
        <g className="text-muted" stroke="currentColor">
          {MAJOR_ROADS.map((d) => (
            <path key={d} d={d} strokeWidth="5" opacity="0.14" />
          ))}
          {STREETS.map((d) => (
            <path key={d} d={d} strokeWidth="1.75" opacity="0.13" />
          ))}
        </g>
        <path
          d={AREA_PATH}
          fill="var(--accent)"
          fillOpacity="0.025"
          stroke="var(--accent)"
          strokeOpacity="0.5"
          strokeWidth="1.5"
          strokeDasharray="5 6"
        />
        {AREA.map(([x, y]) => (
          <rect
            key={`${x},${y}`}
            x={x - 2.5}
            y={y - 2.5}
            width="5"
            height="5"
            fill="var(--bg)"
            stroke="var(--accent)"
            strokeOpacity="0.7"
          />
        ))}
        <g transform="translate(182 176)" className="text-muted">
          <circle r="13" stroke="currentColor" strokeDasharray="2 3" opacity="0.7" />
          <circle r="2.5" fill="currentColor" />
          <text
            x="18"
            y="3"
            fill="currentColor"
            fontSize="8"
            letterSpacing="1.6"
            className="font-mono"
          >
            BASE
          </text>
        </g>
      </g>

      {TASKS.map((at, i) => (
        <TaskPin key={at.join()} at={at} delay={i} still={still} />
      ))}
      {WALKERS.map((w) => (
        <WalkerDot key={`${w.path}${w.offset}`} walker={w} still={still} />
      ))}
    </svg>
  );
}

function TaskPin({ at: [x, y], delay, still }: { at: Point; delay: number; still: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle
        r={still ? 10 : 4}
        stroke="var(--brand-crew)"
        strokeWidth="1.5"
        opacity={still ? 0.35 : 0}
      >
        {!still && (
          <>
            <animate
              attributeName="r"
              values="4;18"
              dur="3s"
              begin={`-${delay}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.8;0"
              dur="3s"
              begin={`-${delay}s`}
              repeatCount="indefinite"
            />
          </>
        )}
      </circle>
      <circle r="7" fill="var(--brand-crew)" opacity="0.18" />
      <circle r="3.5" fill="var(--brand-crew)" />
    </g>
  );
}

function WalkerDot({ walker: w, still }: { walker: Walker; still: boolean }) {
  return (
    <g transform={still ? `translate(${w.still[0]} ${w.still[1]})` : undefined}>
      {!still && (
        <animateMotion
          path={w.path}
          dur={`${w.dur}s`}
          begin={`-${w.offset}s`}
          repeatCount="indefinite"
          {...(w.back ? { keyPoints: '0;1;0', keyTimes: '0;0.5;1', calcMode: 'linear' } : {})}
        />
      )}
      {w.exposed && <ExposedRing still={still} />}
      <circle r="8" fill={DOT} opacity="0.12" />
      <circle r="4.5" fill={DOT} stroke="rgb(0 0 0 / 0.6)" strokeWidth="1.5" />
    </g>
  );
}

/** The in-game imposter mark for an exposed player (index.css `.radar-dot--exposed`). It comes and goes. */
function ExposedRing({ still }: { still: boolean }) {
  return (
    <circle
      r="10"
      stroke="var(--brand-imposter)"
      strokeWidth="1.5"
      strokeDasharray="3 3.3"
      opacity={still ? 0.9 : 0}
    >
      {!still && (
        <>
          <animate
            attributeName="opacity"
            values="0;0;0.95;0.95;0"
            keyTimes="0;0.35;0.45;0.85;1"
            dur="12s"
            repeatCount="indefinite"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0"
            to="360"
            dur="10s"
            repeatCount="indefinite"
          />
        </>
      )}
    </circle>
  );
}
