/** Geo vocabulary. App code uses `{lat, lng}`; GeoJSON edges use `[lng, lat]` (MAP_AND_REGIONS intro). */
export interface LatLng {
  lat: number;
  lng: number;
}

/** GeoJSON position: `[lng, lat]`. */
export type Position = [number, number];

export const toPosition = (p: LatLng): Position => [p.lng, p.lat];
export const toLatLng = ([lng, lat]: Position): LatLng => ({ lat, lng });

/** A ring of positions. Rings in boundaries and regions are closed (first = last). */
export type Ring = Position[];
/** GeoJSON polygon coordinates: the outer ring, then any holes. */
export type PolygonCoords = Ring[];
/** GeoJSON multi-polygon coordinates: an area that may have several parts and holes. */
export type MultiPolygonCoords = PolygonCoords[];
