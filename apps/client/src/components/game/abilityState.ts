/** What an ability button can say from the client's own data (the server still decides, ADR-071). */
import {
  type AbilityId,
  DEFAULT_CONFIG,
  distanceM,
  type LatLng,
  type PlayerView,
  pointInRing,
} from '@afterdark/shared';

export type AbilityUiState = 'ready' | 'cooldown' | 'jammed' | 'full' | 'oob' | 'gps';

/** The full cooldown, for the ring (the cooldowns are fixed, so the defaults are the truth). */
export const abilityCooldownMs = (id: AbilityId): number => {
  const MS_PER_S = 1000;
  const seconds = {
    taskStop: DEFAULT_CONFIG.taskStopCooldownS,
    fakeTask: DEFAULT_CONFIG.fakeTaskCooldownS,
    camouflage: DEFAULT_CONFIG.camouflageCooldownS,
  }[id];
  return seconds * MS_PER_S;
};

/** Why the button is (or is not) usable: GPS, zone and cooldown first (the same order as Infect), then the ability's own rule (E12, E14). */
export function abilityStateOf(view: PlayerView, id: AbilityId, now: number): AbilityUiState {
  const imposter = view.me.imposter;
  const ability = imposter?.abilities.find((a) => a.id === id);
  if (view.me.location?.quality !== 'good') return 'gps';
  if (view.me.zone?.oob) return 'oob';
  if (ability && ability.readyAt > now) return 'cooldown';
  if (id === 'taskStop' && view.game?.taskLock !== undefined) return 'jammed';
  if (id === 'fakeTask' && (imposter?.fakes.length ?? 0) >= DEFAULT_CONFIG.fakeTaskMaxActive) {
    return 'full';
  }
  return 'ready';
}

/**
 * The client's own check of a fake-task spot, from public data: inside the play area, outside
 * every no-go zone, and clear of this Phantom's own fakes. The server also checks the distance to
 * the task points (it never sends them), so a green spot can still be refused.
 */
export function fakeSpotProblem(view: PlayerView, at: LatLng): string | undefined {
  const { boundary, noGo } = view.lobby.map;
  if (!boundary || !pointInRing(at, boundary.ring)) return 'Outside the play area';
  if (noGo.some((zone) => pointInRing(at, zone))) return 'Inside a no-go zone';
  const min = DEFAULT_CONFIG.fakeTaskMinDistanceM;
  if ((view.me.imposter?.fakes ?? []).some((f) => distanceM(f, at) < min)) {
    return 'Too close to your other fake';
  }
  return undefined;
}
