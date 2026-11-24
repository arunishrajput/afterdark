import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => undefined;
  const media = matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

const reduced = () => typeof matchMedia === 'function' && matchMedia(QUERY).matches;

/**
 * True when the player asked for less motion. For SVG (SMIL) animations, which the global
 * `prefers-reduced-motion` CSS rule in index.css cannot reach.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, reduced, () => false);
}
