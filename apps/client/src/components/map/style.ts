import type L from 'leaflet';

/** The boundary's neon edge. Leaflet needs real colours, not CSS variables. */
export const BOUNDARY_COLOR = '#e6e8ee';

export const BOUNDARY_STYLE: L.PathOptions = {
  color: BOUNDARY_COLOR,
  weight: 3,
  opacity: 0.95,
  fillColor: BOUNDARY_COLOR,
  fillOpacity: 0.04,
};

/** Everything outside the boundary is darkened. */
export const OUTSIDE_STYLE: L.PathOptions = {
  stroke: false,
  fillColor: '#000',
  fillOpacity: 0.55,
  interactive: false,
};

/**
 * Keyless raster tiles. The spec's CARTO Dark Matter URL now answers every tile
 * with an "API KEY REQUIRED" placeholder (ADR-039), so we use the standard OSM
 * tiles and darken them in CSS (`.dark-tiles`, see index.css).
 */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** One colour per region (by position in the list); labels carry the name for colour-blind players. */
export const REGION_COLORS = [
  '#4cc9f0',
  '#f72585',
  '#b8f35a',
  '#ffb703',
  '#a78bfa',
  '#ff7a59',
] as const;

export const regionColor = (index: number): string =>
  REGION_COLORS[index % REGION_COLORS.length] ?? REGION_COLORS[0];

export const NOGO_COLOR = '#ff5a5a';
