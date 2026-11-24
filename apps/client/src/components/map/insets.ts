/**
 * A full-screen map has the HUD floating over its top and a sheet over its bottom (UI_UX §2, ADR-103).
 * `MapInsets` are those overlays' heights: fits, "Locate me" and a tapped task card centre on the
 * band between them, not on the middle of the screen. Pure: no Leaflet at runtime.
 */
import type { LatLng } from '@afterdark/shared';
import type { FitBoundsOptions } from 'leaflet';
import { createContext } from 'react';

export interface MapInsets {
  /** Pixels covered at the top of the map (the HUD). */
  top: number;
  /** Pixels covered at the bottom (the sheet). */
  bottom: number;
}

export const NO_INSETS: MapInsets = { top: 0, bottom: 0 };

/** The insets of the map being drawn; components inside the map read it. */
export const MapInsetsContext = createContext<MapInsets>(NO_INSETS);

/** Breathing room around a fitted area, on every side. */
const FIT_SIDE_PX = 28;

export function fitOptions(insets: MapInsets, animate = true): FitBoundsOptions {
  return {
    paddingTopLeft: [FIT_SIDE_PX, FIT_SIDE_PX + insets.top],
    paddingBottomRight: [FIT_SIDE_PX, FIT_SIDE_PX + insets.bottom],
    animate,
  };
}

interface Projector {
  project(ll: LatLng, zoom: number): { x: number; y: number };
  unproject(p: [number, number], zoom: number): { lat: number; lng: number };
}

/** The map centre that puts `target` in the middle of the visible band between the overlays. */
export function visibleCenter(
  map: Projector,
  target: LatLng,
  zoom: number,
  insets: MapInsets,
): LatLng {
  const p = map.project(target, zoom);
  const { lat, lng } = map.unproject([p.x, p.y + (insets.bottom - insets.top) / 2], zoom);
  return { lat, lng };
}
