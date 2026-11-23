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

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A region's name (and its bucketed player count) at the region's origin. Names are user text: always escaped. */
export function regionLabelIcon(
  name: string,
  bucket: string | undefined,
  color: string,
): L.DivIcon {
  const count =
    bucket === undefined ? '' : `<span class="region-label__count">${escapeHtml(bucket)}</span>`;
  return L.divIcon({
    className: 'region-marker',
    html: `<div class="region-label" style="--region:${color}"><span>${escapeHtml(name)}</span>${count}</div>`,
    iconSize: [0, 0],
  });
}

/** A task point, coloured by region. `deletable` draws it larger so it is easy to tap. */
export function pointIcon(color: string, opts: { host: boolean; deletable: boolean }): L.DivIcon {
  const size = opts.deletable ? 24 : 14;
  return L.divIcon({
    className: 'point-marker',
    html: `<div class="task-point${opts.host ? ' task-point--host' : ''}${opts.deletable ? ' task-point--deletable' : ''}" style="--region:${color}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function baseIcon(): L.DivIcon {
  return L.divIcon({
    className: 'base-marker',
    html: '<div class="base-flag" aria-label="Base">★</div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}
