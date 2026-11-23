/**
 * The host-setup layers of the map (MAP_AND_REGIONS §7): region outlines and
 * labels with bucketed counts, task points coloured by region, no-go hatching,
 * the Base, and the 9-section preview of one region. Everything here is public
 * setup data from the view; section polygons are derived locally.
 */
import {
  DEFAULT_CONFIG,
  type LatLng,
  type RegionCount,
  type RegionPublic,
  type Ring,
  sectionShapes,
  type TaskPointPublic,
} from '@afterdark/shared';
import { useMemo } from 'react';
import { Marker, Polygon, Tooltip } from 'react-leaflet';

import { areaToLatLngs, ringToLatLngs, toLeaflet } from './geo';
import { baseIcon, pointIcon, regionLabelIcon } from './icons';
import { NOGO_COLOR, regionColor } from './style';

export interface SetupOverlay {
  regions: readonly RegionPublic[];
  points: readonly TaskPointPublic[];
  noGo: readonly Ring[];
  base?: LatLng | undefined;
  counts: readonly RegionCount[];
  /** Draw the 9 sections of this region, with labels. */
  previewRegionId?: string | undefined;
}

/** What a tap on the map does while the host edits (tapping a point deletes it). */
export type MapTool = 'none' | 'points' | 'base' | 'nogo';

function SectionPreview({ region, color }: { region: RegionPublic; color: string }) {
  const key = JSON.stringify([region.id, region.areaM2, region.origin, region.rhoM]);
  const shapes = useMemo(
    () => sectionShapes(region, DEFAULT_CONFIG.sectionCentreRatio),
    // The region object is new on every view; only its geometry matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const usable = new Map(region.sections.map((s) => [s.id, s.usable]));
  return (
    <>
      {shapes
        .filter((s) => s.area.length > 0)
        .map((s) => {
          const ok = usable.get(s.id) ?? false;
          return (
            <Polygon
              key={s.id}
              positions={areaToLatLngs(s.area)}
              interactive={false}
              pathOptions={{
                color,
                weight: 1.5,
                dashArray: ok ? undefined : '4 6',
                fillColor: ok ? color : '#888',
                fillOpacity: ok ? 0.18 : 0.06,
                opacity: ok ? 0.9 : 0.5,
              }}
            >
              <Tooltip permanent direction="center" className="section-label" interactive={false}>
                {ok ? s.id : `${s.id} ✕`}
              </Tooltip>
            </Polygon>
          );
        })}
    </>
  );
}

export function SetupLayers({
  overlay,
  tool,
  onPointTap,
}: {
  overlay: SetupOverlay;
  tool: MapTool;
  onPointTap?: ((id: string) => void) | undefined;
}) {
  const { regions, points, noGo, base, counts, previewRegionId } = overlay;
  const indexOf = new Map(regions.map((r, i) => [r.id, i]));
  const bucket = new Map(counts.map((c) => [c.regionId, c.bucket]));
  const preview = regions.find((r) => r.id === previewRegionId);
  const deletable = tool === 'points' && onPointTap !== undefined;
  return (
    <>
      {regions.map((r, i) => (
        <Polygon
          key={r.id}
          positions={areaToLatLngs(r.area)}
          interactive={false}
          pathOptions={{
            color: regionColor(i),
            weight: 2,
            opacity: 0.85,
            fillColor: regionColor(i),
            fillOpacity: 0.07,
          }}
        />
      ))}
      {preview && (
        <SectionPreview
          key={preview.id}
          region={preview}
          color={regionColor(indexOf.get(preview.id) ?? 0)}
        />
      )}
      {noGo.map((ring, i) => (
        <Polygon
          // The ring has no id of its own; its position in the host's list is its identity.
          key={`nogo-${i}`}
          positions={ringToLatLngs(ring)}
          interactive={false}
          pathOptions={{ color: NOGO_COLOR, weight: 2, dashArray: '6 4', className: 'nogo-zone' }}
        />
      ))}
      {points.map((p) => (
        <Marker
          // `interactive` is fixed when Leaflet creates the marker, so entering or leaving the
          // points step must make new markers.
          key={`${p.id}:${deletable ? 'tap' : 'view'}`}
          position={[p.lat, p.lng]}
          icon={pointIcon(regionColor(indexOf.get(p.regionId) ?? 0), {
            host: p.source === 'host',
            deletable,
          })}
          interactive={deletable}
          keyboard={false}
          zIndexOffset={-100}
          eventHandlers={deletable ? { click: () => onPointTap(p.id) } : {}}
        />
      ))}
      {regions.map((r, i) => (
        <Marker
          key={`label-${r.id}`}
          position={toLeaflet(r.origin)}
          icon={regionLabelIcon(r.name, bucket.get(r.id), regionColor(i))}
          interactive={false}
          keyboard={false}
          zIndexOffset={500}
        />
      ))}
      {base && (
        <Marker
          position={toLeaflet(base)}
          icon={baseIcon()}
          interactive={false}
          keyboard={false}
          zIndexOffset={800}
        />
      )}
    </>
  );
}
