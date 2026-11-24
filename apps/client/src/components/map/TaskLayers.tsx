/**
 * The viewer's own task layers (MAP_AND_REGIONS §7): the section to head for
 * (Stage 1) and the revealed pins (Stage 2). Only the player's own cards are
 * drawn, from the view; the task pool is never sent during play.
 */
import { DEFAULT_CONFIG, type RegionPublic, sectionShapes, type TaskCard } from '@afterdark/shared';
import { useContext, useEffect, useMemo } from 'react';
import { Marker, Polygon, useMap } from 'react-leaflet';

import { sectionAnchor } from '../game/taskGeo';
import { areaToLatLngs } from './geo';
import { taskPinIcon } from './icons';
import { MapInsetsContext, visibleCenter } from './insets';
import { regionColor } from './style';

export interface TaskOverlay {
  cards: readonly TaskCard[];
  regions: readonly RegionPublic[];
  /** The card the player tapped: the map flies to it. */
  focusId?: string | undefined;
  /** Bumped on every tap, so tapping the same card twice flies there twice. */
  focusSeq?: number | undefined;
}

function SectionHighlight({
  region,
  card,
  color,
}: {
  region: RegionPublic;
  card: TaskCard;
  color: string;
}) {
  const key = JSON.stringify([region.id, region.areaM2, region.origin, region.rhoM]);
  const area = useMemo(
    () =>
      sectionShapes(region, DEFAULT_CONFIG.sectionCentreRatio).find((s) => s.id === card.section)
        ?.area ?? [],
    // The region object is new on every view; only its geometry matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, card.section],
  );
  if (area.length === 0) return null;
  return (
    <Polygon
      positions={areaToLatLngs(area)}
      interactive={false}
      pathOptions={{
        color,
        weight: 3,
        dashArray: '8 6',
        fillColor: color,
        fillOpacity: 0.22,
        className: 'task-section',
      }}
    />
  );
}

function FocusEffect({ overlay }: { overlay: TaskOverlay }) {
  const map = useMap();
  const insets = useContext(MapInsetsContext);
  const { focusId, focusSeq, cards, regions } = overlay;
  useEffect(() => {
    if (!focusSeq || !focusId) return;
    const card = cards.find((c) => c.id === focusId);
    if (!card) return;
    const target =
      card.stage === 'pin'
        ? { lat: card.lat, lng: card.lng }
        : sectionAnchor(
            regions.find((r) => r.id === card.regionId) ?? (regions[0] as RegionPublic),
            card.section,
          );
    if (!target) return;
    // Centred in the band between the HUD and the sheet, not behind them.
    const zoom = Math.max(map.getZoom(), 18);
    map.flyTo(visibleCenter(map, target, zoom, insets), zoom, { duration: 0.6 });
    // Only a tap (focusSeq) should move the map, not every new view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSeq]);
  return null;
}

export function TaskLayers({ overlay }: { overlay: TaskOverlay }) {
  const { cards, regions } = overlay;
  const indexOf = new Map(regions.map((r, i) => [r.id, i]));
  return (
    <>
      {cards.map((card) => {
        const region = regions.find((r) => r.id === card.regionId);
        if (!region) return null;
        const color = regionColor(indexOf.get(region.id) ?? 0);
        if (card.stage === 'assigned') {
          return <SectionHighlight key={card.id} region={region} card={card} color={color} />;
        }
        return (
          <Marker
            key={`${card.id}:${card.atPin}`}
            position={[card.lat, card.lng]}
            icon={taskPinIcon(color, card.atPin)}
            interactive={false}
            keyboard={false}
            zIndexOffset={700}
          />
        );
      })}
      <FocusEffect overlay={overlay} />
    </>
  );
}
