/**
 * The game's event log (Phase 12, ADR-095): a plain, append-only list the engine fills as
 * things happen and the results screen is built from after the game. It is never projected
 * while the game runs (`views/projectResults.ts` is the only reader, and only once `ended`).
 * It stays on the server and dies with the game (a rematch clears it). Pure: `now` is injected.
 */
import type { EndReason, MeetingTally, MinigameType, Winner } from '@afterdark/shared';

import { gameNow } from '../clock';
import type { RoomState } from '../state';

/** What each kind of entry carries in `data`. Entries refer to players by id, never by name. */
export interface LogDataMap {
  roles: { imposters: number; crew: number };
  /** A solo task finished: the points went to the team and to `actors[0]`. */
  task: { task: MinigameType; points: number };
  /** A co-op finished: the team got `team`; each crew participant got `personal`. `actors` are both participants. */
  coop: { team: number; personal: number };
  /** `actors[0]` finished a fake task, which paid nothing. `by` is the Phantom who planted it. */
  fooled: { by?: string };
  taskStop: Record<string, never>;
  fakePlanted: Record<string, never>;
  camouflage: Record<string, never>;
  /** `actors` = [imposter, target]: a channel finished and the target is exposed. */
  infectDone: Record<string, never>;
  /** `actors[0]` became infected (incubation over), exposed earlier by `by`. */
  infected: { by: string };
  meetingCalled: Record<string, never>;
  /** Tallies are counts per target, never who voted. */
  meetingResult: { tallies: MeetingTally[]; ejectedId?: string; wasImposter?: boolean };
  zonePenalty: { points: number };
  pause: Record<string, never>;
  resume: Record<string, never>;
  end: { winner: Winner; reason: EndReason };
}

export type LogType = keyof LogDataMap;

export type LogEntry = {
  [K in LogType]: {
    /** Server epoch ms (wall time). */
    at: number;
    /** Game ms: the match clock, so a pause or a meeting leaves no gap. */
    gameMs: number;
    type: K;
    actors: string[];
    data: LogDataMap[K];
  };
}[LogType];

/** Appends an entry. A room without a game (an abort during the spawn phase) logs nothing. */
export function logEvent<K extends LogType>(
  state: RoomState,
  now: number,
  type: K,
  actors: string[],
  data: LogDataMap[K],
): void {
  const game = state.game;
  if (!game) return;
  const entry = { at: now, gameMs: gameNow(game.clock, now), type, actors, data } as LogEntry;
  game.log.push(entry);
  const overflow = game.log.length - state.config.eventLogMax;
  if (overflow > 0) game.log.splice(0, overflow);
}

/** The entries of one type, in order (the results builder's one reader). */
export function entriesOf<K extends LogType>(
  log: readonly LogEntry[],
  type: K,
): Extract<LogEntry, { type: K }>[] {
  return log.filter((e): e is Extract<LogEntry, { type: K }> => e.type === type);
}
