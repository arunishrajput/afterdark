/**
 * Per-player views (ARCHITECTURE §4). Every field is copied explicitly from an
 * allow-list that follows the ROLES.md visibility matrix: never spread a server
 * object into a view. Every new field needs a leak-test assertion.
 */
import {
  EDITABLE_CONFIG_KEYS,
  type GameConfig,
  type GameConfigPublic,
  type LocationView,
  type MapSetupPublic,
  type PlayerView,
  type PublicPlayer,
  type RegionPublic,
  sectionBigEnough,
  type SectionId,
  type TaskPointPublic,
} from '@afterdark/shared';

import type { PlayerState, RoomState, SetupRegion } from '../engine/state';
import { fixQuality } from '../engine/systems/location';
import { isOutOfBounds } from '../engine/systems/zone';
import { projectGame, projectOwnGame } from './projectGame';
import { projectResults } from './projectResults';

/** The view without the per-send envelope (`v`, `serverNow`), so it can be diffed. */
export type PlayerViewBody = Omit<PlayerView, 'v' | 'serverNow'>;

function projectConfig(config: GameConfig): GameConfigPublic {
  return Object.fromEntries(EDITABLE_CONFIG_KEYS.map((k) => [k, config[k]])) as GameConfigPublic;
}

function projectPlayer(p: PlayerState, hostId: string): PublicPlayer {
  return {
    id: p.id,
    username: p.username,
    isHost: p.id === hostId,
    ready: p.ready,
    connected: p.connected,
    status: p.spectator ? 'spectator' : 'active',
    // Public once ejected (ADR-019); never set for anyone else.
    ...(p.spectator && p.revealedRole ? { revealedRole: p.revealedRole } : {}),
  };
}

function projectRegion(
  r: SetupRegion,
  sectionUsable: (regionId: string, id: SectionId, areaM2: number) => boolean,
): RegionPublic {
  return {
    id: r.id,
    name: r.name,
    area: r.area,
    origin: { lat: r.origin.lat, lng: r.origin.lng },
    rhoM: r.rhoM,
    areaM2: r.areaM2,
    sections: r.sections.map((s) => ({
      id: s.id,
      areaM2: s.areaM2,
      usable: sectionUsable(r.id, s.id, s.areaM2),
    })),
  };
}

/** Setup is public to every player (they all see the map). The task pool is shown only in the lobby. */
function projectMap(state: RoomState): MapSetupPublic {
  const { boundary, setup, config } = state;
  const lobby = state.phase === 'lobby';
  const pointsIn = new Set(
    setup.taskPoints.filter((p) => !p.disabled).map((p) => `${p.regionId}:${p.section}`),
  );
  const usable = (regionId: string, id: SectionId, areaM2: number) =>
    sectionBigEnough(areaM2, config) && pointsIn.has(`${regionId}:${id}`);
  return {
    ...(boundary ? { boundary: { ring: boundary.ring, areaM2: boundary.areaM2 } } : {}),
    regions: setup.regions.map((r) => projectRegion(r, usable)),
    taskPoints: lobby
      ? setup.taskPoints.map((p): TaskPointPublic => ({
          id: p.id,
          lat: p.lat,
          lng: p.lng,
          regionId: p.regionId,
          section: p.section,
          source: p.source,
        }))
      : [],
    noGo: setup.noGo,
    ...(setup.base ? { base: { lat: setup.base.lat, lng: setup.base.lng } } : {}),
  };
}

/** Only the viewer's own fix, and only what the lobby UI needs from it. */
function projectOwnLocation(
  state: RoomState,
  me: PlayerState,
  now: number,
): LocationView | undefined {
  const { loc } = me;
  if (!loc) return undefined;
  return {
    lat: loc.lat,
    lng: loc.lng,
    accuracy: loc.accuracy,
    quality: fixQuality(loc, now, state.config),
    oob: isOutOfBounds(state, loc),
  };
}

export function projectView(state: RoomState, playerId: string, now: number): PlayerViewBody {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) throw new Error('projectView: player is not in this room');
  const location = projectOwnLocation(state, me, now);
  const results = projectResults(state);
  return {
    lobby: {
      code: state.code,
      phase: state.phase,
      hostId: state.hostId,
      testMode: state.config.testMode,
      config: projectConfig(state.config),
      map: projectMap(state),
      players: state.players.map((p) => projectPlayer(p, state.hostId)),
      ...(state.countdownEndsAt === undefined ? {} : { countdownEndsAt: state.countdownEndsAt }),
    },
    me: {
      id: me.id,
      username: me.username,
      isHost: me.id === state.hostId,
      ready: me.ready,
      status: me.spectator ? 'spectator' : 'active',
      ...(location ? { location } : {}),
      ...projectOwnGame(state, me, now),
    },
    ...(state.setup.regions.length > 0 ? { game: projectGame(state, playerId, now) } : {}),
    ...(results ? { results } : {}),
  };
}
