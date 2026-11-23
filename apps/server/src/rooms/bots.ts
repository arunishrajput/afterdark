/**
 * In-process test bots (`dev:addBots`, test mode only; ADR-056). A bot is an
 * ordinary player in the room state, driven by the same commands a socket
 * client would cause (`join`, `locUpdate`, `setReady`), so it goes through the
 * real engine. It has no socket, hence no views. Movement is the shared
 * `BotWalker`, the same code the bot CLI uses. A crew bot also does tasks (Phase 5):
 * it walks to its first task's pin (it reads the pin from the room state, as test
 * tooling may), opens the task there, waits `botTaskMinS`–`botTaskMaxS` seconds and
 * finishes it with the test-mode shortcut. An imposter bot only walks, unless the room's
 * bots were added with `imposterBehaviour: 'chase'` (Phase 7): then it hunts the nearest
 * healthy crew member (it reads positions from the room state, as test tooling may),
 * infects through the real `infectStart` command, follows during the channel and walks
 * away afterwards so the incubation can begin. In a meeting (Phase 8) every bot walks to the Base, skips the
 * discussion and votes (a random active player, or Skip with `botVoteSkipPercent`; an imposter bot never
 * votes for another imposter). Only with `meetings: 'random'` does a bot also call a meeting, once, at a
 * random game time between `botMeetingMinS` and `botMeetingMaxS`.
 */
import {
  type BotImposterBehaviour,
  type BotMeetingMode,
  BotWalker,
  ChaseBrain,
  createRng,
  hashSeed,
  type LatLng,
  offsetByMeters,
  type Rng,
} from '@afterdark/shared';

import { gameNow } from '../engine/clock';
import type { PlayerState, RoomState } from '../engine/state';
import { fixQuality } from '../engine/systems/location';
import { meetingsLeft } from '../engine/systems/meetings';
import { isActive } from '../engine/systems/players';
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
  /** Imposter bots on `chase` hunt with this. */
  brain: ChaseBrain;
  /** Real ms when this bot finishes the task it has open. */
  doneAt?: number;
  /** Game ms when this bot calls its meeting (`meetings: 'random'`). */
  callAtGameMs?: number;
}

export class BotDriver {
  private readonly bots = new Map<string, Bot>();
  private nextNo = 1;
  private imposterBehaviour: BotImposterBehaviour = 'wander';
  private meetingMode: BotMeetingMode = 'off';

  constructor(
    private readonly room: Room,
    private readonly newId: () => string,
  ) {}

  /** Adds up to `count` bots; returns how many joined (the lobby may fill up). `behaviour` applies to every imposter bot in the room. */
  add(count: number, behaviour?: BotImposterBehaviour, meetings?: BotMeetingMode): number {
    if (behaviour) this.imposterBehaviour = behaviour;
    if (meetings) this.meetingMode = meetings;
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
    const allowed = (at: LatLng) =>
      this.room.state.boundary !== undefined && !isOutOfBounds(this.room.state, at);
    const bot: Bot = {
      rng,
      brain: new ChaseBrain({ infectionRadiusM: state.config.infectionRadiusM, rng, allowed }),
      walker: new BotWalker({
        start,
        rng,
        config: state.config,
        // Judged against the room's current setup, which the host can still change.
        allowed,
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
      const meeting = state.phase === 'playing' ? state.game?.meeting : undefined;
      const hunt = meeting ? undefined : this.hunt(bot, state, p, now);
      // At a revealed pin the bot stays put to work; before that it heads for the task.
      const working = task?.stage === 'pin' && task.atPin;
      if (meeting) {
        // Everyone goes to the Base and stays there; an ejected bot has nowhere to be.
        if (p.spectator || meeting.gathered.includes(p.id) || !state.setup.base) bot.walker.stay();
        else bot.walker.step(state.setup.base);
      } else if (working) bot.walker.stay();
      else if (hunt) bot.walker.step(hunt.to);
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
      if (fresh) this.meet(bot, fresh, now);
    }
  }

  /**
   * A chasing imposter bot's decision for this step (undefined for everyone else): where to walk, and
   * `infectStart` when it is close enough. The command can still be refused (cooldown, GPS), which is fine: it retries.
   */
  private hunt(
    bot: Bot,
    state: RoomState,
    p: PlayerState,
    now: number,
  ): { to: LatLng | undefined } | undefined {
    if (this.imposterBehaviour !== 'chase' || p.role !== 'imposter' || !p.infect || !p.loc) return;
    if (state.phase !== 'playing' || !state.game) return;
    const targets = state.players
      // Only players the server would accept as a target: a stale human is not worth chasing.
      .filter(
        (x) =>
          x.role === 'crew' &&
          !x.left &&
          x.infection === undefined &&
          x.loc &&
          fixQuality(x.loc, now, state.config) === 'good',
      )
      .map((x) => ({ lat: x.loc?.lat ?? 0, lng: x.loc?.lng ?? 0 }));
    const action = bot.brain.decide({
      here: bot.walker.pos,
      targets,
      ready: gameNow(state.game.clock, now) >= p.infect.readyAtGameMs,
      channelling: p.infect.channel !== undefined,
      completed: p.infect.completed,
    });
    if (action.type === 'infect') {
      this.room.dispatch({ type: 'infectStart', playerId: p.id });
      return { to: bot.walker.pos };
    }
    return { to: action.to };
  }

  /** Take part in the meeting in progress, or (in `random` mode) call one when this bot's time has come. */
  private meet(bot: Bot, p: PlayerState, now: number): void {
    const state = this.room.state;
    const game = state.game;
    if (state.phase !== 'playing' || !game || !isActive(p)) return;
    const meeting = game.meeting;
    if (!meeting) {
      if (this.meetingMode !== 'random' || meetingsLeft(state, p) === 0) return;
      const { botMeetingMinS: min, botMeetingMaxS: max } = state.config;
      bot.callAtGameMs ??= (min + bot.rng.next() * (max - min)) * MS_PER_S;
      if (gameNow(game.clock, now) >= bot.callAtGameMs) {
        this.room.dispatch({ type: 'meetingCall', playerId: p.id });
      }
      return;
    }
    if (meeting.stage === 'discuss') {
      this.room.dispatch({ type: 'meetingSkipDiscussion', playerId: p.id });
    } else if (meeting.stage === 'vote' && meeting.votes[p.id] === undefined) {
      this.room.dispatch({ type: 'meetingVote', playerId: p.id, target: this.voteOf(bot, p) });
    }
  }

  /** A random active player (never itself, never a fellow imposter for an imposter bot), or Skip. */
  private voteOf(bot: Bot, p: PlayerState): string {
    const state = this.room.state;
    if (bot.rng.next() * 100 < state.config.botVoteSkipPercent) return 'skip';
    const candidates = state.players.filter(
      (x) => x.id !== p.id && isActive(x) && !(p.role === 'imposter' && x.role === 'imposter'),
    );
    return candidates[bot.rng.int(0, candidates.length - 1)]?.id ?? 'skip';
  }

  /** Open the task at the pin, then finish it after a random wait. */
  private work(bot: Bot, p: PlayerState, now: number): void {
    const task = p.tasks?.[0];
    if (!task || this.room.state.phase !== 'playing' || this.room.state.game?.meeting) return;
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
