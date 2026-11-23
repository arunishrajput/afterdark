/** A typed wrapper: polylabel 2.x ships no types. It returns `[x, y]` plus the point's distance to the edge. */
// @ts-expect-error no type declarations in the package
import untyped from 'polylabel';

type Ring = number[][];

export const polylabel = untyped as (
  polygon: Ring[],
  precision?: number,
) => [number, number] & { distance: number };
