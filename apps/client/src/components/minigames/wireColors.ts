import type { WireColor } from '@afterdark/shared';

/** Colours picked to stay apart on a dark map. Every wire also has a symbol, so colour is never the only cue. */
export const WIRE_HEX: Record<WireColor, string> = {
  red: '#ff4d4d',
  blue: '#4da3ff',
  green: '#4cd964',
  yellow: '#ffd60a',
  purple: '#bf7bff',
  orange: '#ff9f0a',
};
