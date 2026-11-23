import type { WireColor, WireSymbol } from '@afterdark/shared';

import { WIRE_HEX } from './wireColors';

const SHAPES: Record<WireSymbol, string> = {
  circle: 'M12 3a9 9 0 1 0 0.001 0Z',
  square: 'M4 4h16v16H4Z',
  triangle: 'M12 3 22 21H2Z',
  star: 'M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7-6.3-3.8-6.3 3.8 1.7-7L2 9.5l7.1-.6Z',
  diamond: 'M12 2 22 12 12 22 2 12Z',
  cross: 'M9 2h6v7h7v6h-7v7H9v-7H2V9h7Z',
};

export function WireSymbolIcon({
  color,
  symbol,
  size = 28,
}: {
  color: WireColor;
  symbol: WireSymbol;
  size?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={SHAPES[symbol]} fill={WIRE_HEX[color]} stroke="#0a0c12" strokeWidth="1.5" />
    </svg>
  );
}
