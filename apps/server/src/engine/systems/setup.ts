/**
 * Host setup commands after the boundary: regions, task points, no-go zones, Base
 * (MAP_AND_REGIONS §1). Every change un-readies everyone (RULES §3.6).
 */
import {
  areaContains,
  type GameConfigEditablePatch,
  type LatLng,
  type LobbyEditTaskPointsPayload,
  type LobbyRegenerateRegionsPayload,
  type Position,
  type Ring,
  sectionOf,
  type SetupSummary,
  summarizeSetup,
  validateNoGoZone,
} from '@afterdark/shared';

import type { RoomState } from '../state';
import { type Effect, RuleError } from '../types';
import { applyLayout, nextSeed, playableAreaOf } from './layout';

/** Protocol cap on the pool, so a runaway client can't grow the state without bound. */
const MAX_TASK_POINTS = 400;

function requireHostInLobby(state: RoomState, playerId: string): void {
  if (state.phase !== 'lobby') throw new RuleError('WRONG_PHASE', 'Only possible in the lobby');
  if (state.hostId !== playerId) throw new RuleError('NOT_HOST', 'Only the host can do that');
}

function requireBoundary(state: RoomState): void {
  if (!state.boundary) throw new RuleError('INVALID_PAYLOAD', 'Draw the boundary first.');
}

/** A setup change: un-ready everyone and tell the room (RULES §3.6). */
function changed(state: RoomState, effects: Effect[]): void {
  for (const p of state.players) p.ready = false;
  effects.push({ kind: 'event', to: 'all', event: { type: 'lobby.mapChanged' } });
}

/** What the lobby and the start rules need to know about the setup. */
export function setupSummaryOf(state: RoomState): SetupSummary {
  const { regions, taskPoints, base } = state.setup;
  return summarizeSetup(
    { boundary: state.boundary, base, regions, points: taskPoints },
    state.config,
  );
}

/** The host changed the region-count setting: rebuild the layout (called by `updateConfig`). */
export function relayoutAfterConfig(state: RoomState, patch: GameConfigEditablePatch): void {
  if (patch.regionCount !== undefined && state.boundary) {
    applyLayout(state, { regeneratePoints: true, keepNames: false });
  }
}

/** A new or edited boundary: lay everything out again (called by `setBoundary`). */
export function relayoutAfterBoundary(state: RoomState): void {
  applyLayout(state, { regeneratePoints: true, keepNames: false });
}

export function regenerateRegions(
  state: RoomState,
  playerId: string,
  input: LobbyRegenerateRegionsPayload,
  effects: Effect[],
): void {
  requireHostInLobby(state, playerId);
  requireBoundary(state);
  if (input.regionCount !== undefined) state.config.regionCount = input.regionCount;
  state.setup.seed = input.seed ?? nextSeed(state, state.setup.seed);
  state.setup.poolSeed = state.setup.seed;
  applyLayout(state, { regeneratePoints: true, keepNames: false });
  changed(state, effects);
}

export function renameRegion(
  state: RoomState,
  playerId: string,
  regionId: string,
  name: string,
  effects: Effect[],
): void {
  requireHostInLobby(state, playerId);
  const region = state.setup.regions.find((r) => r.id === regionId);
  if (!region) throw new RuleError('NOT_FOUND', 'No such region');
  if (name.length === 0) throw new RuleError('INVALID_PAYLOAD', 'A region needs a name.');
  if (region.name === name) return;
  region.name = name;
  changed(state, effects);
}

export function editTaskPoints(
  state: RoomState,
  playerId: string,
  input: LobbyEditTaskPointsPayload,
  effects: Effect[],
): void {
  requireHostInLobby(state, playerId);
  requireBoundary(state);
  const { setup, config } = state;
  const inside = areaContains(playableAreaOf(state));
  const additions = input.add ?? [];
  const places = additions.map((p) => ({
    p,
    place: inside(p) ? sectionOf(p, setup.regions, config.sectionCentreRatio) : null,
  }));
  if (places.some((x) => x.place === null)) {
    throw new RuleError(
      'INVALID_PAYLOAD',
      'A task point must be inside the boundary and outside no-go zones.',
    );
  }
  const removing = new Set(input.remove ?? []);
  const before = setup.taskPoints.length;
  setup.taskPoints = setup.taskPoints.filter((p) => !removing.has(p.id));
  let didChange = setup.taskPoints.length !== before;

  if (input.regenerate) {
    setup.poolSeed = nextSeed(state, setup.poolSeed);
    applyLayout(state, { regeneratePoints: true, keepNames: true });
    didChange = true;
  }
  if (setup.taskPoints.length + places.length > MAX_TASK_POINTS) {
    throw new RuleError('INVALID_PAYLOAD', `At most ${MAX_TASK_POINTS} task points.`);
  }
  for (const { p, place } of places) {
    if (!place) continue;
    setup.taskPoints.push({
      id: `p${setup.nextPointNo++}`,
      lat: p.lat,
      lng: p.lng,
      regionId: place.regionId,
      section: place.section,
      source: 'host',
      disabled: false,
    });
    didChange = true;
  }
  if (didChange) changed(state, effects);
}

const sameRings = (a: readonly Ring[], b: readonly Ring[]) =>
  a.length === b.length &&
  a.every((ring, i) => {
    const other = b[i];
    return (
      !!other &&
      ring.length === other.length &&
      ring.every((p, j) => p[0] === other[j]?.[0] && p[1] === other[j]?.[1])
    );
  });

export function setNoGoZones(
  state: RoomState,
  playerId: string,
  zones: readonly (readonly Position[])[],
  effects: Effect[],
): void {
  requireHostInLobby(state, playerId);
  const rings = zones.map((z, i) => {
    const res = validateNoGoZone(z, `No-go zone ${i + 1}`);
    if (!res.ok) throw new RuleError('INVALID_PAYLOAD', res.message);
    return res.ring;
  });
  if (sameRings(rings, state.setup.noGo)) return;
  state.setup.noGo = rings;
  if (state.boundary) applyLayout(state, { regeneratePoints: false, keepNames: true });
  changed(state, effects);
}

export function setBase(state: RoomState, playerId: string, base: LatLng, effects: Effect[]): void {
  requireHostInLobby(state, playerId);
  requireBoundary(state);
  if (!areaContains(playableAreaOf(state))(base)) {
    throw new RuleError(
      'INVALID_PAYLOAD',
      'The Base must be inside the boundary and outside no-go zones.',
    );
  }
  const { setup } = state;
  if (setup.base?.lat === base.lat && setup.base.lng === base.lng && !setup.baseIsDefault) return;
  setup.base = { lat: base.lat, lng: base.lng };
  setup.baseIsDefault = false;
  changed(state, effects);
}
