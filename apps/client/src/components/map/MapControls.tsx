/**
 * The round map buttons (UI_UX §2): Fit the playable area and Locate me. Over a full-screen map they
 * sit at the right, just above the bottom sheet and the attribution; on a card map, in its top corner.
 */
import type { ReactNode } from 'react';

import type { MapInsets } from './insets';

/** The buttons sit this far from the screen edge and from the sheet. */
const CONTROL_GAP_PX = 12;
/** Room left for Leaflet's attribution line under the buttons. */
const ATTRIBUTION_PX = 18;
/** Card map: from its top-right corner. */
const CARD_GAP_PX = 8;

export function MapControls({
  insets,
  onFit,
  onLocate,
}: {
  insets: MapInsets | undefined;
  /** Absent until there is an area to fit. */
  onFit: (() => void) | undefined;
  /** Absent until there is a position. */
  onLocate: (() => void) | undefined;
}) {
  if (!onFit && !onLocate) return null;
  const at = insets
    ? { right: CONTROL_GAP_PX, bottom: insets.bottom + CONTROL_GAP_PX + ATTRIBUTION_PX }
    : { right: CARD_GAP_PX, top: CARD_GAP_PX };
  return (
    <div className="absolute z-[1000] flex flex-col gap-2" style={at}>
      {onFit && (
        <MapButton testId="map-fit" label="Fit map to the playable area" onClick={onFit}>
          <FitIcon />
        </MapButton>
      )}
      {onLocate && (
        <MapButton testId="map-locate" label="Centre the map on me" onClick={onLocate}>
          <LocateIcon />
        </MapButton>
      )}
    </div>
  );
}

/** A round map button (Google Maps style): icon only, with its name for screen readers. */
function MapButton({
  testId,
  label,
  onClick,
  children,
}: {
  testId: string;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-12 place-items-center rounded-full border border-white/20 bg-surface/90 text-text shadow-lg backdrop-blur transition hover:border-white/40 active:scale-95"
    >
      {children}
    </button>
  );
}

const ICON = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/** Four corners: "show the whole area". */
function FitIcon() {
  return (
    <svg {...ICON}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

/** A crosshair: "where am I". */
function LocateIcon() {
  return (
    <svg {...ICON}>
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  );
}
