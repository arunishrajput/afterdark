/**
 * When may a lobby start its countdown (RULES §3.7)? Shared so the server
 * engine decides and the client's setup checklist shows the same reasons.
 * Phase 2 added the boundary; Phase 3 adds Base and task-point blockers.
 */
import type { GameConfig } from '../config/schema';

export type StartBlocker =
  'notEnoughPlayers' | 'tooManyImposters' | 'boundaryMissing' | 'notAllReady';

type ImposterConfig = Pick<GameConfig, 'imposterCount' | 'imposterCountAuto'>;

/** Imposters for `playerCount` players: the manual count, or the first auto rule that fits. */
export function resolveImposterCount(config: ImposterConfig, playerCount: number): number {
  if (config.imposterCount !== 'auto') return config.imposterCount;
  const rule =
    config.imposterCountAuto.find((r) => playerCount <= r.maxPlayers) ??
    config.imposterCountAuto.at(-1);
  if (!rule) throw new Error('imposterCountAuto is empty'); // the schema requires ≥ 1 rule
  return rule.count;
}

export function startBlockers(
  config: ImposterConfig & Pick<GameConfig, 'minPlayers' | 'minCrewRemaining'>,
  roster: { playerCount: number; readyCount: number; boundarySet: boolean },
): StartBlocker[] {
  const out: StartBlocker[] = [];
  if (roster.playerCount < config.minPlayers) out.push('notEnoughPlayers');
  const crew = roster.playerCount - resolveImposterCount(config, roster.playerCount);
  if (roster.playerCount >= config.minPlayers && crew < config.minCrewRemaining) {
    out.push('tooManyImposters');
  }
  if (!roster.boundarySet) out.push('boundaryMissing');
  if (roster.readyCount < roster.playerCount) out.push('notAllReady');
  return out;
}
