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
 * away afterwards so the incubation can begin. With `imposterBehaviour: 'sabotage'` (Phase 9) it chases as
 * well and uses Task Stop and Fake Task through the real ability commands whenever they are ready (a fake
 * goes to a random spot near the Base; an invalid spot is refused and another is tried on the next step).
 * Co-op (Phase 10): a bot holding a co-op card (the partner card first) walks to its pin, starts or joins
 * the session there, and after a work wait types the other side's PIN (it reads it from the room state, as
 * test tooling may; a human paired with a bot is shown the bot's PIN, `botShows`). A `sabotage` imposter bot
 * whose Camouflage is ready disguises itself when a crew member waits for a partner within `botStandInRangeM`,
 * walks there and stands in as the partner.
 * In a meeting (Phase 8) every bot walks to the Base, skips the
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
  distanceM,
  hashSeed,
  type LatLng,
  offsetByMeters,
  type Rng,
  type SoloMinigameType,
} from '@afterdark/shared';

import { gameNow } from '../engine/clock';
import type { CoopSession, PlayerState, RoomState, TaskState } from '../engine/state';
import { isCamouflaged } from '../engine/systems/camouflage';
import { sessionOfPlayer, slotOf, taskIdFor } from '../engine/systems/coop';
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
  /** Key Fetch leg 1: real ms when the bot has held the key long enough to pick it up. */
  pickAt?: number;
  /** Real ms when this bot types its co-op PIN. */
  coopDoneAt?: number;
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
    /** Headless runs (the balance simulator) have no human to keep the bots online. */
    private readonly headless = false,
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
    const humansOnline = this.headless || state.players.some((p) => !p.bot && p.connected);
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
      const task = state.phase === 'playing' ? this.focusTask(p) : undefined;
      const inCoop = state.phase === 'playing' && sessionOfPlayer(state, p.id) !== undefined;
      const meeting = state.phase === 'playing' ? state.game?.meeting : undefined;
      const hunt = meeting ? undefined : this.hunt(bot, state, p, now);
      // At a revealed pin the bot stays put to work; before that it heads for the task.
      const working = (task?.stage === 'pin' && task.atPin) || inCoop;
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

  /** What a bot walks to: a co-op card first (so pairs really finish), then its first solo task. */
  private focusTask(p: PlayerState): TaskState | undefined {
    return (
      p.partnerTask ??
      p.tasks?.find((t) => t.kind === 'coop') ??
      p.tasks?.find((t) => t.kind === 'solo')
    );
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
    if (this.imposterBehaviour === 'wander' || p.role !== 'imposter' || !p.infect || !p.loc) return;
    if (state.phase !== 'playing' || !state.game) return;
    if (this.imposterBehaviour === 'sabotage') {
      this.useAbilities(bot, state, p, now);
      const standIn = this.standIn(state, p, now);
      if (standIn) return { to: standIn };
    }
    const targets = state.players
      // Only players the server would accept as a target: a stale human is not worth chasing.
      .filter(
        (x) =>
          x.role === 'crew' &&
          !x.left &&
          x.infection === undefined &&
          x.loc &&
          fixQuality(x.loc, now, state.config) === 'good' &&
          distanceM(bot.walker.pos, x.loc) <= state.config.botChaseSightM,
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

  /** A sabotaging imposter bot uses every ability that is ready: Task Stop at once, Fake Task at a random spot near the Base. */
  private useAbilities(bot: Bot, state: RoomState, p: PlayerState, now: number): void {
    const game = state.game;
    if (!game || game.meeting) return;
    const gameMs = gameNow(game.clock, now);
    const ready = (id: 'taskStop' | 'fakeTask' | 'camouflage') => {
      const a = p.abilities?.[id];
      return a !== undefined && gameMs >= a.readyAtGameMs;
    };
    if (ready('taskStop') && game.taskLock === undefined) {
      this.room.dispatch({ type: 'abilityTaskStop', playerId: p.id });
    }
    // Disguise only when there is a seat to take: a crew member waiting for a partner close by.
    if (ready('camouflage') && !isCamouflaged(state, p, now) && this.waitingNear(state, p)) {
      this.room.dispatch({ type: 'abilityCamouflage', playerId: p.id });
    }
    const base = state.setup.base;
    if (ready('fakeTask') && base) {
      const r = state.config.botFakeScatterM;
      const at = offsetByMeters(base, (bot.rng.next() * 2 - 1) * r, (bot.rng.next() * 2 - 1) * r);
      this.room.dispatch({ type: 'abilityFakeTask', playerId: p.id, at });
    }
  }

  /** A waiting session whose owner is alone and within `botStandInRangeM` of the bot, if any. */
  private waitingNear(state: RoomState, p: PlayerState): CoopSession | undefined {
    const loc = p.loc;
    if (!loc || !state.game) return undefined;
    return state.game.coops.find(
      (c) =>
        c.phase === 'waiting' &&
        c.starterId === c.ownerId &&
        c.assignedId !== p.id &&
        distanceM(loc, c) <= state.config.botStandInRangeM,
    );
  }

  /** While disguised and a crew member waits nearby: walk to them and take the partner's seat. Returns where to walk. */
  private standIn(state: RoomState, p: PlayerState, now: number): LatLng | undefined {
    if (!isCamouflaged(state, p, now) || sessionOfPlayer(state, p.id)) return undefined;
    const target = this.waitingNear(state, p);
    if (!target) return undefined;
    if (p.loc && distanceM(p.loc, target) <= state.config.reachRadiusM) {
      this.room.dispatch({ type: 'coopJoin', playerId: p.id, taskId: target.id });
    }
    return { lat: target.lat, lng: target.lng };
  }

  /**
   * A bot's part in a co-op task. Returns true while the bot is busy with one (so it leaves solo tasks alone):
   * start or join at the pin, then type the other side's PIN after a work wait.
   */
  private coop(bot: Bot, p: PlayerState, now: number): boolean {
    const state = this.room.state;
    const mine = sessionOfPlayer(state, p.id);
    if (mine) {
      if (mine.phase !== 'active' || !mine.pins) {
        delete bot.coopDoneAt;
        // Someone may be waiting for this bot as their partner: go there first, or two bots waiting on each other never meet.
        const helping = p.partnerTask;
        if (
          mine.phase === 'waiting' &&
          mine.starterId === p.id &&
          helping &&
          helping.coopId !== mine.id
        ) {
          this.room.dispatch({ type: 'coopCancel', playerId: p.id, taskId: taskIdFor(mine, p.id) });
        }
        return true;
      }
      const { botTaskMinS, botTaskMaxS } = state.config;
      bot.coopDoneAt ??=
        now + (botTaskMinS + bot.rng.next() * (botTaskMaxS - botTaskMinS)) * MS_PER_S;
      if (now >= bot.coopDoneAt) {
        const other = slotOf(mine, p.id) === 'owner' ? 'partner' : 'owner';
        const res = this.room.dispatch({
          type: 'coopSubmit',
          playerId: p.id,
          taskId: taskIdFor(mine, p.id),
          answer: { pin: mine.pins[other] },
        });
        if (res.ok) delete bot.coopDoneAt;
      }
      return true;
    }
    delete bot.coopDoneAt;
    const card = p.partnerTask ?? p.tasks?.find((t) => t.kind === 'coop');
    if (!card) return false;
    if (card.stage === 'pin' && card.atPin) {
      const session = state.game?.coops.find((c) => c.id === card.coopId);
      if (session?.phase === 'idle') {
        this.room.dispatch({ type: 'coopStart', playerId: p.id, taskId: card.id });
      } else if (session?.phase === 'waiting' && session.starterId !== p.id) {
        this.room.dispatch({ type: 'coopJoin', playerId: p.id, taskId: card.id });
      }
    }
    return true;
  }

  /** Take part in the meeting in progress, or (in `random` mode) call one when this bot's time has come. */
  private meet(bot: Bot, p: PlayerState, now: number): void {
    const state = this.room.state;
    const game = state.game;
    if (state.phase !== 'playing' || !game || !isActive(p)) return;
    const meeting = game.meeting;
    if (!meeting) {
      if (this.meetingMode !== 'random' || meetingsLeft(state, p) === 0) return;
      const {
        botMeetingMinS: min,
        botMeetingMaxS: max,
        botMeetingCallPercent: callers,
      } = state.config;
      // Decided once: some bots never call (people rarely do), the rest at a random game time.
      bot.callAtGameMs ??=
        bot.rng.next() * 100 < callers
          ? (min + bot.rng.next() * (max - min)) * MS_PER_S
          : Number.POSITIVE_INFINITY;
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
    // A crew bot sometimes works out who the imposters are (a stand-in for human deduction).
    if (p.role === 'crew' && bot.rng.next() * 100 < state.config.botVoteSuspicionPercent) {
      const guilty = state.players.filter((x) => x.role === 'imposter' && isActive(x));
      if (guilty.length > 0) return bot.rng.pick(guilty).id;
    }
    const candidates = state.players.filter(
      (x) => x.id !== p.id && isActive(x) && !(p.role === 'imposter' && x.role === 'imposter'),
    );
    return candidates[bot.rng.int(0, candidates.length - 1)]?.id ?? 'skip';
  }

  /** A random wait of `botTaskMinS` to `botTaskMaxS`, scaled for the game type. */
  private workMs(bot: Bot, type: SoloMinigameType): number {
    const { botTaskMinS, botTaskMaxS, botTaskTimeScale } = this.room.state.config;
    const waitS = botTaskMinS + bot.rng.next() * (botTaskMaxS - botTaskMinS);
    return waitS * botTaskTimeScale[type] * MS_PER_S;
  }

  /** Open the task at the pin, then finish it after a random wait (Key Fetch is played for real, both legs). */
  private work(bot: Bot, p: PlayerState, now: number): void {
    if (this.room.state.phase !== 'playing' || this.room.state.game?.meeting) return;
    if (this.coop(bot, p, now)) return;
    const task = p.tasks?.find((t) => t.kind === 'solo');
    if (!task || task.type === 'coop_pin') return;
    if (!task.open) {
      delete bot.pickAt;
      if (task.stage !== 'pin' || !task.atPin) return;
      const res = this.room.dispatch({ type: 'taskOpen', playerId: p.id, taskId: task.id });
      if (!res.ok) return;
      bot.doneAt = now + this.workMs(bot, task.type);
      return;
    }
    if (task.type === 'keyfetch') {
      this.workKey(bot, p, task, now);
      return;
    }
    if (bot.doneAt !== undefined && now >= bot.doneAt) {
      const res = this.room.dispatch({ type: 'devAutoComplete', playerId: p.id, taskId: task.id });
      if (res.ok) delete bot.doneAt;
    }
  }

  /**
   * Key Fetch, through the real commands: grab and hold the key at Point 1 (`keyHoldS` of game time),
   * pick it up (the server moves the card on), then at Point 2 turn it as the puzzle shows.
   */
  private workKey(bot: Bot, p: PlayerState, task: TaskState, now: number): void {
    const { keyHoldS } = this.room.state.config;
    if (!task.keyHeld) {
      if (bot.pickAt === undefined) {
        const res = this.room.dispatch({
          type: 'taskAction',
          playerId: p.id,
          taskId: task.id,
          action: { step: 'grab' },
        });
        // Hold a little longer than asked: game time and this step's real time need not agree to the millisecond.
        if (res.ok) bot.pickAt = now + (keyHoldS + 1) * MS_PER_S;
        return;
      }
      if (now < bot.pickAt) return;
      this.room.dispatch({
        type: 'taskAction',
        playerId: p.id,
        taskId: task.id,
        action: { step: 'pickup' },
      });
      delete bot.pickAt;
      return;
    }
    if (bot.doneAt === undefined || now < bot.doneAt) return;
    const puzzle = task.open?.puzzle as { turns?: string[] } | undefined;
    const res = this.room.dispatch({
      type: 'taskSubmit',
      playerId: p.id,
      taskId: task.id,
      answer: puzzle?.turns ?? [],
    });
    if (res.ok) delete bot.doneAt;
  }
}
