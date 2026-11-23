/**
 * In-process test bots (`dev:addBots`, test mode only; ADR-056). A bot is an
 * ordinary player in the room state, driven by the same commands a socket
 * client would cause (`join`, `locUpdate`, `setReady`), so it goes through the
 * real engine. It has no socket, hence no views. Movement is the shared
 * `BotWalker`, the same code the bot CLI uses. A crew bot also does tasks (Phase 5):
 * it walks to its first task's pin (it reads the pin from the room state, as test
 * tooling may), opens the task there, waits `botTaskMinS`–`botTaskMaxS` seconds and
 * finishes it with the test-mode shortcut.
 */
import {
  BotWalker,
  createRng,
  hashSeed,
  type LatLng,
  offsetByMeters,
  type Rng,
} from '@afterdark/shared';

import type { PlayerState, RoomState } from '../engine/state';
import { isOutOfBounds } from '../engine/systems/zone';
import type { Room } from './Room';

/** Accuracy of a bot's fix: comfortably "good". */
const BOT_ACCURACY_M = 5;
/** Bots start scattered this far around the Base. */
const START_SCATTER_M = 10;
const MS_PER_S = 1000;

interface Bot {
  walker: BotWalker;
  rng: Rng;
  /** Real ms when this bot finishes the task it has open. */
  doneAt?: number;
}

export class BotDriver {
  private readonly bots = new Map<string, Bot>();
  private nextNo = 1;

  constructor(
    private readonly room: Room,
    private readonly newId: () => string,
  ) {}

  /** Adds up to `count` bots; returns how many joined (the lobby may fill up). */
  add(count: number): number {
    let added = 0;
    for (let i = 0; i < count; i++) {
      const playerId = this.newId();
      const username = `bot-${this.nextNo++}`;
      const res = this.room.dispatch({ type: 'join', playerId, username, bot: true });
      if (!res.ok) break;
      added++;
    }
    return added;
  }

  private botsIn(state: RoomState): PlayerState[] {
    return state.players.filter((p) => p.bot && !p.left);
  }

  private walkerFor(state: RoomState, p: PlayerState): Bot | undefined {
    const existing = this.bots.get(p.id);
    if (existing) return existing;
    const base = state.setup.base;
    if (!base) return undefined;
    const rng = createRng(hashSeed(`${state.code}|bot|${p.id}`));
    const start = offsetByMeters(
      base,
      (rng.next() * 2 - 1) * START_SCATTER_M,
      (rng.next() * 2 - 1) * START_SCATTER_M,
    );
    const bot: Bot = {
      rng,
      walker: new BotWalker({
        start,
        rng,
        config: state.config,
        // Judged against the room's current setup, which the host can still change.
        allowed: (at: LatLng) =>
          this.room.state.boundary !== undefined && !isOutOfBounds(this.room.state, at),
        home: base,
      }),
    };
    this.bots.set(p.id, bot);
    return bot;
  }

  /** One step per room tick: send a fix, ready up in the lobby. */
  tick(state: RoomState, now: number): void {
    const bots = this.botsIn(state);
    if (bots.length === 0) return;
    const humansOnline = state.players.some((p) => !p.bot && p.connected);
    for (const p of bots) {
      // With nobody watching, bots go offline so an empty room can be swept (RULES §3.9).
      if (!humansOnline && p.connected) this.room.dispatch({ type: 'disconnect', playerId: p.id });
      if (humansOnline && !p.connected) this.room.dispatch({ type: 'connect', playerId: p.id });
    }
    if (!humansOnline || state.phase === 'ended') return;
    for (const p of bots) {
      const bot = this.walkerFor(state, p);
      if (!bot) continue;
      const spawn = state.phase === 'spawning' && p.spawn && !p.spawn.reached ? p.spawn : undefined;
      const task = state.phase === 'playing' ? p.tasks?.[0] : undefined;
      // At a revealed pin the bot stays put to work; before that it heads for the task.
      const working = task?.stage === 'pin' && task.atPin;
      if (working) bot.walker.stay();
      else bot.walker.step(spawn ?? (task ? { lat: task.lat, lng: task.lng } : undefined));
      const at = bot.walker.fix();
      this.room.dispatch({
        type: 'locUpdate',
        playerId: p.id,
        fix: { lat: at.lat, lng: at.lng, accuracy: BOT_ACCURACY_M, ts: now },
      });
      const fresh = this.room.state.players.find((x) => x.id === p.id);
      if (state.phase === 'lobby' && fresh && !fresh.ready) {
        this.room.dispatch({ type: 'setReady', playerId: p.id, ready: true });
      }
      if (fresh) this.work(bot, fresh, now);
    }
  }

  /** Open the task at the pin, then finish it after a random wait. */
  private work(bot: Bot, p: PlayerState, now: number): void {
    const task = p.tasks?.[0];
    if (!task || this.room.state.phase !== 'playing') return;
    if (!task.open) {
      if (task.stage !== 'pin' || !task.atPin) return;
      const res = this.room.dispatch({ type: 'taskOpen', playerId: p.id, taskId: task.id });
      if (!res.ok) return;
      const { botTaskMinS, botTaskMaxS } = this.room.state.config;
      const waitS = botTaskMinS + bot.rng.next() * (botTaskMaxS - botTaskMinS);
      bot.doneAt = now + waitS * MS_PER_S;
      return;
    }
    if (bot.doneAt !== undefined && now >= bot.doneAt) {
      const res = this.room.dispatch({ type: 'devAutoComplete', playerId: p.id, taskId: task.id });
      if (res.ok) delete bot.doneAt;
    }
  }
}
