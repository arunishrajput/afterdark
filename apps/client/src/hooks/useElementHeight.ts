import { useLayoutEffect, useState } from 'react';

/** The live height of an element, in whole CSS pixels: pass the callback as its `ref`. */
export function useElementHeight<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => setHeight(Math.round(el.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, height];
}
