/** Geo vocabulary. App code uses `{lat, lng}`; GeoJSON edges use `[lng, lat]` (MAP_AND_REGIONS intro). */
export interface LatLng {
  lat: number;
  lng: number;
}

/** GeoJSON position: `[lng, lat]`. */
export type Position = [number, number];

export const toPosition = (p: LatLng): Position => [p.lng, p.lat];
export const toLatLng = ([lng, lat]: Position): LatLng => ({ lat, lng });
