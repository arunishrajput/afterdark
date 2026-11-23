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

export const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
export const TILE_SUBDOMAINS = 'abcd';
