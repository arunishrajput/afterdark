import type { DotFlag } from '@afterdark/shared';
import L from 'leaflet';

/** Divs, not Leaflet's PNG markers: they are themed in CSS and need no asset pipeline. */
export function selfIcon(opts: { oob: boolean; heading?: number }): L.DivIcon {
  const cone =
    opts.heading === undefined
      ? ''
      : `<div class="self-heading" style="transform:rotate(${opts.heading}deg)"></div>`;
  return L.divIcon({
    className: 'self-marker',
    html: `${cone}<div class="self-dot${opts.oob ? ' self-dot--oob' : ''}"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function dotIcon(flags: readonly DotFlag[]): L.DivIcon {
  const mods = flags.map((f) => ` radar-dot--${f}`).join('');
  return L.divIcon({
    className: 'radar-marker',
    html: `<div class="radar-dot${mods}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}
