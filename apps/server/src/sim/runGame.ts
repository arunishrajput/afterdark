/**
 * One headless game for the balance script (Phase 11, TESTING §5). The real engine and the
 * real in-process `BotDriver` run in a `Room` whose clock is injected and advanced one
 * second per step, so a 25 minute game takes a moment. Every player is a bot: crew work
 * through their tasks (the wait depends on the game type), imposters chase and use their
 * abilities, and bots call meetings at random game times and vote at random. Nothing here
 * touches the network. Results are counted from the state and the engine's own events.
 */
import {
  DEFAULT_CONFIG,
  type EndReason,
  type GameConfig,
  type LatLng,
  type Winner,
} from '@afterdark/shared';

import { gameNow } from '../engine/clock';
import { createRoomState } from '../engine/state';
import { BotDriver } from '../rooms/bots';
import { Room } from '../rooms/Room';

const MS_PER_S = 1000;
const S_PER_MIN = 60;
/** Where the simulated games are played. */
const HOME: LatLng = { lat: 28.6139, lng: 77.209 };
const SPAWN_WAIT_STEPS = 3;
/** A game that has not ended this long after its match time is a bug: stop and say so. */
const OVERRUN_S = 30 * S_PER_MIN;
const T0 = 1_700_000_000_000;

/**
 * Bot behaviour for a believable pace (the real defaults are quick, so a developer can watch):
 * a crew bot takes 30 to 60 s over a game (scaled per type) and walks at the default pace.
 */
export const SIM_BOT_CONFIG: Partial<GameConfig> = {
  botTaskMinS: 30,
  botTaskMaxS: 60,
  // An imposter commits to a target only when it is nearly within reach. The radar's nearby radius (40 m)
  // is what the server shows it, but a person still has to find and approach someone unseen; 20 m is the
  // calibration assumption of ADR-090 (re-check after a field test).
  botChaseSightM: 20,
  // A quarter of the players ever call a meeting, and crew sometimes vote for a real imposter.
  botMeetingCallPercent: 25,
  botVoteSuspicionPercent: 35,
};

export interface SimOptions {
  /** Distinguishes games: map, spawns, roles and rolls all derive from it. */
  seed: string;
  players: number;
  /** Boundary radius in metres. */
  radiusM: number;
  /** Config overrides on top of the defaults (a tuning candidate). */
  config: Partial<GameConfig>;
  meetings: 'off' | 'random';
}

export interface GameStats {
  seed: string;
  players: number;
  imposters: number;
  winner: Winner;
  reason: EndReason | 'overrun' | 'none';
  /** Game minutes at the end (meetings and pauses do not count). */
  minutes: number;
  teamScore: number;
  targetScore: number;
  /** Solo tasks and co-op tasks completed. */
  soloTasks: number;
  coopTasks: number;
  /** Team points that came from co-op tasks. */
  coopPoints: number;
  crew: number;
  /** Crew who were ever infected, and ever exposed or infected. */
  infected: number;
  exposed: number;
  infectionsCompleted: number;
  meetings: number;
  /** Imposters ejected, and crew ejected by mistake. */
  impostersEjected: number;
  crewEjected: number;
  taskStops: number;
}

export function simulateGame(opts: SimOptions): GameStats {
  const clock = { now: T0 };
  const config: GameConfig = {
    ...structuredClone(DEFAULT_CONFIG),
    testMode: true,
    ...SIM_BOT_CONFIG,
    ...opts.config,
  };
  const state = createRoomState({
    code: `SIM${opts.seed}`.slice(0, 12).toUpperCase().replace(/[^A-Z0-9]/g, 'X'),
    hostId: 'host',
    username: 'host',
    allowTestMode: true,
    radarSalt: opts.seed,
    config,
  });
  // The host plays too: a bot like everyone else.
  const host = state.players[0];
  if (host) host.bot = true;
  let nextId = 0;
  const room = new Room(state, { now: () => clock.now });
  const driver = new BotDriver(room, () => `bot${++nextId}`, true);
  driver.add(opts.players - 1, 'sabotage', opts.meetings);
  room.dispatch({
    type: 'setBoundary',
    playerId: 'host',
    boundary: { type: 'circle', center: HOME, radiusM: opts.radiusM },
  });

  let solo = 0;
  let coop = 0;
  let coopPoints = 0;
  let completedInfections = 0;
  let meetings = 0;
  let taskStops = 0;
  const everInfected = new Set<string>();
  const everExposed = new Set<string>();
  let lastScore = 0;
  let lastLockUntil: number | undefined;
  room.subscribe((s, effects) => {
    const completes = effects.filter(
      (e) => e.kind === 'event' && e.event.type === 'task.completed',
    ).length;
    const score = s.game?.teamScore ?? 0;
    if (score > lastScore && completes > 0) {
      // A solo task tells one player, a co-op task both.
      if (completes >= 2) {
        coop++;
        coopPoints += score - lastScore;
      } else solo++;
    }
    lastScore = score;
    for (const e of effects) {
      if (e.kind !== 'event') continue;
      if (e.event.type === 'infect.completed') completedInfections++;
      if (e.event.type === 'meeting.called') meetings++;
    }
    // A Task Stop shows as a new lock on the game.
    const lock = s.game?.taskLock;
    if (lock && lock.untilGameMs !== lastLockUntil) taskStops++;
    lastLockUntil = lock?.untilGameMs;
  });
  room.onTick((s, at) => driver.tick(s, at));

  const step = () => {
    clock.now += MS_PER_S;
    room.tick();
  };

  // Lobby → countdown → spawning → reveal → playing.
  step();
  step();
  room.dispatch({ type: 'setReady', playerId: 'host', ready: true });
  for (let i = 0; i < config.startCountdownS + 2 && room.state.phase === 'lobby'; i++) step();
  for (let i = 0; i < SPAWN_WAIT_STEPS; i++) step();
  room.dispatch({ type: 'forceStart', playerId: 'host' });
  for (let i = 0; i < config.roleRevealS + 2 && room.state.phase !== 'playing'; i++) step();

  const limitS = config.playTimeMin * S_PER_MIN + OVERRUN_S;
  let steps = 0;
  while (room.state.phase === 'playing' && steps < limitS) {
    step();
    steps++;
    for (const p of room.state.players) {
      if (p.role !== 'crew') continue;
      if (p.infection === 'infected') everInfected.add(p.id);
      if (p.infection !== undefined) everExposed.add(p.id);
    }
  }

  const final = room.state;
  const game = final.game;
  const crew = final.players.filter((p) => p.role === 'crew');
  return {
    seed: opts.seed,
    players: opts.players,
    imposters: final.players.filter((p) => p.role === 'imposter').length,
    winner: final.result?.winner ?? null,
    reason: final.result?.reason ?? (final.phase === 'playing' ? 'overrun' : 'none'),
    minutes: game ? gameNow(game.clock, clock.now) / MS_PER_S / S_PER_MIN : 0,
    teamScore: game?.teamScore ?? 0,
    targetScore: final.config.targetScore,
    soloTasks: solo,
    coopTasks: coop,
    coopPoints,
    crew: crew.length,
    infected: everInfected.size,
    exposed: everExposed.size,
    infectionsCompleted: completedInfections,
    meetings,
    impostersEjected: final.players.filter((p) => p.role === 'imposter' && p.spectator).length,
    crewEjected: crew.filter((p) => p.spectator).length,
    taskStops,
  };
}
