/**
 * The full-screen map layout (UI_UX §2, ADR-103), like a maps app: the map fills the screen, the
 * HUD floats over its top and a sheet over its bottom. Their heights are the map's insets, so
 * fits and focus land in the band between them, and toasts sit just above the sheet.
 */
import { type ReactNode, useEffect, useMemo } from 'react';

import { useElementHeight } from '../../hooks/useElementHeight';
import type { MapInsets } from '../map/insets';

/** Toasts float this far above the sheet. */
const TOAST_GAP_PX = 12;

export function MapScreen({
  testId,
  map,
  top,
  bottom,
  children,
}: {
  testId?: string;
  /** The map and anything drawn over the whole of it (jam and pause overlays). */
  map: (insets: MapInsets) => ReactNode;
  /** Floats over the top edge (the HUD and banners). */
  top: ReactNode;
  /** Floats over the bottom edge (the sheet). */
  bottom: ReactNode;
  /** Everything else: dialogs, full-screen sheets, the zone glow. */
  children?: ReactNode;
}) {
  const [topRef, topHeight] = useElementHeight<HTMLDivElement>();
  const [bottomRef, bottomHeight] = useElementHeight<HTMLDivElement>();
  const insets = useMemo(
    () => ({ top: topHeight, bottom: bottomHeight }),
    [topHeight, bottomHeight],
  );

  // The toast stack (App-wide) moves up over the map instead of covering the sheet.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--toast-bottom', `${bottomHeight + TOAST_GAP_PX}px`);
    return () => {
      root.style.removeProperty('--toast-bottom');
    };
  }, [bottomHeight]);

  return (
    <main data-testid={testId} className="fixed inset-0 overflow-hidden">
      <div className="absolute inset-0 isolate z-0">{map(insets)}</div>
      <div
        ref={topRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
      >
        <div className="pointer-events-auto mx-auto flex max-w-md flex-col gap-2">{top}</div>
      </div>
      <div ref={bottomRef} className="absolute inset-x-0 bottom-0 z-20">
        <div className="mx-auto max-w-md">{bottom}</div>
      </div>
      {children}
    </main>
  );
}
