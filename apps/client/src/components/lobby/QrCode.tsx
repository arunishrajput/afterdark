import { encode } from 'uqr';

/** QR as an SVG path built from the module matrix (no innerHTML). Lazy-loaded. */
export default function QrCode({ value, label }: { value: string; label: string }) {
  const { data, size } = encode(value, { ecc: 'M', border: 2 });
  let d = '';
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="aspect-square w-full rounded-xl bg-white"
    >
      <path d={d} fill="#07080a" />
    </svg>
  );
}
