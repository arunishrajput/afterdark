/** polylabel 2.x ships no types. It returns `[x, y]` with the point's distance to the edge as `.distance`. */
declare module 'polylabel' {
  type Ring = number[][];
  export default function polylabel(
    polygon: Ring[],
    precision?: number,
    debug?: boolean,
  ): [number, number] & { distance: number };
}
