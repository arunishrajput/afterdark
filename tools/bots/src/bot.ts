/**
 * One bot player over a real socket. It uses only the public protocol: join,
 * ready, `loc:update`, tasks. In the spawn phase it walks to its own spawn pin.
 * In play a crew bot works through its first task card the way a player does: it
 * finds a spot inside the card's section from the region polygons, holds there until
 * the pin appears, walks to the pin, opens the task, waits `botTaskMinS`–`botTaskMaxS`
 * and finishes it with the test-mode shortcut (`dev:autoComplete`). Imposters wander,
 * or with `imposterBehaviour: 'chase'` hunt the nearest crew-looking dot on their radar
 * (so the lobby needs visibility Everyone to see far), `ability:infect` when close,
 * follow during the channel and walk away afterwards; `sabotage` does that and also uses Task Stop and
 * Fake Task (`ability:taskStop`, `ability:fakeTask` at a random spot near the Base) whenever its
 * own view says they are ready. In a meeting every bot walks to the Base, skips
 * the discussion and votes at random (Skip with `botVoteSkipPercent`; an imposter never votes for an
 * ally). Co-op (Phase 10): a bot works its co-op card before any solo one: at the pin it starts the
 * session (or joins when the partner is waiting) and, once both are in, types the partner's PIN. Bots in
 * one process share a PIN board (tag → the PIN that tag shows) to stand in for the partner's phone; a
 * human partner's PIN is unreadable to a bot, so that task simply expires. With `meetings: 'random'` a bot also calls one meeting, at a random time into play.
 */
import {
  type BotImposterBehaviour,
  type BotMeetingMode,
  BotWalker,
  ChaseBrain,
  type ClientToServerEvents,
  createRng,
  DEFAULT_CONFIG,
  hashSeed,
  type LatLng,
  offsetByMeters,
  type PlayerView,
  pointInRing,
  pointInSection,
  type RadarPayload,
  type Rng,
  type ServerToClientEvents,
  type TaskCard,
} from '@afterdark/shared';
import { io, type Socket } from 'socket.io-client';

type BotSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Accuracy a bot reports: comfortably "good". */
const BOT_ACCURACY_M = 5;
/** Bots start scattered this far around the Base. */
const START_SCATTER_M = 10;
const MS_PER_S = 1000;
const RETRY_CALL_MS = 10_000;

/** Bots in one process hold up their PINs here, keyed by the tag that shows them: the stand-in for reading a partner's phone. */
const PIN_BOARD = new Map<string, string>();

export interface BotOptions {
  url: string;
  code: string;
  name: string;
  seed: number;
  speed: number;
  imposterBehaviour?: BotImposterBehaviour;
  meetings?: BotMeetingMode;
  log: (line: string) => void;
}

export class Bot {
  private readonly socket: BotSocket;
  private readonly rng: Rng;
  private view: PlayerView | undefined;
  private radar: RadarPayload | undefined;
  private brain: ChaseBrain | undefined;
  /** Infections completed so far, counted from `infect.completed` events (the chase brain walks away on a rise). */
  private completed = 0;
  private walker: BotWalker | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  /** serverTime ≈ Date.now() + offsetMs */
  private offsetMs = 0;
  private lastPhase: string | undefined;
  /** Real ms when this bot calls its meeting (`meetings: 'random'`), set when play starts. */
  private callAt: number | undefined;
  /** The stage this bot last acted in, so each action is sent once per stage. */
  private actedIn: string | undefined;
  /** The card being worked and where its section spot is (found once per card). */
  private job:
    { taskId: string; spot: LatLng | undefined; opened?: boolean; doneAt?: number } | undefined;
  /** Real ms when this bot types its co-op PIN, once the puzzle is out. */
  private coopDoneAt: number | undefined;

  constructor(private readonly o: BotOptions) {
    this.rng = createRng(hashSeed(`${o.seed}|${o.name}`));
    this.socket = io(o.url, { transports: ['websocket'], reconnection: true });
    this.socket.on('view', (v) => this.onView(v));
    this.socket.on('radar', (r) => (this.radar = r));
    this.socket.on('event', (e) => {
      if (e.type === 'infect.completed') this.completed++;
    });
  }

  private async call<E extends keyof ClientToServerEvents>(
    event: E,
    payload: Parameters<ClientToServerEvents[E]>[0],
  ): Promise<{ ok: boolean; message?: string; data?: unknown }> {
    const timed = this.socket.timeout(DEFAULT_CONFIG.ackTimeoutMs) as unknown as {
      emitWithAck(
        ev: string,
        p: unknown,
      ): Promise<{ ok: boolean; data?: unknown; error?: { message: string } }>;
    };
    try {
      const res = await timed.emitWithAck(event, payload);
      return res.ok
        ? { ok: true, data: res.data }
        : { ok: false, message: res.error?.message ?? 'failed' };
    } catch {
      return { ok: false, message: 'no answer' };
    }
  }

  /** Connects, syncs the clock, joins the lobby and starts the walking loop. */
  async start(): Promise<boolean> {
    await new Promise<void>((resolve, reject) => {
      this.socket.once('connect', resolve);
      this.socket.once('connect_error', reject);
    });
    const sentAt = Date.now();
    const ping = await this.call('time:ping', { clientTs: sentAt });
    if (ping.ok) {
      const serverTs = (ping.data as { serverTs: number }).serverTs;
      this.offsetMs = serverTs - (sentAt + (Date.now() - sentAt) / 2);
    }
    const joined = await this.call('lobby:join', {
      code: this.o.code,
      username: this.o.name,
      acceptedSafety: true,
    });
    if (!joined.ok) {
      this.o.log(`${this.o.name}: could not join (${joined.message})`);
      this.stop();
      return false;
    }
    this.o.log(`${this.o.name}: joined ${this.o.code}`);
    this.timer = setInterval(() => void this.step(), DEFAULT_CONFIG.botStepS * MS_PER_S);
    return true;
  }

  stop(): void {
    clearInterval(this.timer);
    this.socket.disconnect();
  }

  private onView(view: PlayerView): void {
    this.view = view;
    if (view.lobby.phase !== this.lastPhase) {
      this.lastPhase = view.lobby.phase;
      const role = view.me.role ? ` as ${view.me.role}` : '';
      this.o.log(`${this.o.name}: ${view.lobby.phase}${role}`);
    }
  }

  private walkerFor(view: PlayerView): BotWalker | undefined {
    if (this.walker) return this.walker;
    const { base, boundary, noGo } = view.lobby.map;
    if (!base || !boundary) return undefined; // the host has not finished the setup yet
    const start = offsetByMeters(
      base,
      (this.rng.next() * 2 - 1) * START_SCATTER_M,
      (this.rng.next() * 2 - 1) * START_SCATTER_M,
    );
    this.walker = new BotWalker({
      start,
      rng: this.rng,
      config: DEFAULT_CONFIG,
      speedFactor: this.o.speed,
      home: base,
      allowed: (p: LatLng) =>
        pointInRing(p, boundary.ring) && !noGo.some((zone) => pointInRing(p, zone)),
    });
    return this.walker;
  }

  /** The imposter's hunt this step (undefined for crew, for wandering imposters and outside play). */
  private async hunt(
    view: PlayerView,
    walker: BotWalker,
  ): Promise<{ to: LatLng | undefined } | undefined> {
    const infect = view.me.imposter?.infect;
    if (this.o.imposterBehaviour === 'wander' || !infect || view.lobby.phase !== 'playing') return;
    if (this.o.imposterBehaviour === 'sabotage') await this.useAbilities(view);
    this.brain ??= new ChaseBrain({
      infectionRadiusM: view.lobby.config.infectionRadiusM,
      rng: this.rng,
      allowed: (p: LatLng) => this.allowed(view, p),
    });
    const targets = (this.radar?.dots ?? []).filter(
      (d) =>
        !d.flags.some((f) => f === 'ally' || f === 'exposed' || f === 'infected' || f === 'stale'),
    );
    const action = this.brain.decide({
      here: walker.pos,
      targets,
      ready: infect.readyAt <= Date.now() + this.offsetMs,
      channelling: infect.channel !== undefined,
      completed: this.completed,
    });
    if (action.type === 'infect') {
      const res = await this.call('ability:infect', {});
      if (res.ok) this.o.log(`${this.o.name}: infecting`);
      return { to: walker.pos };
    }
    return { to: action.to };
  }

  /** Uses every class ability whose cooldown is over: Task Stop when nothing is jammed, Fake Task at a random spot near the Base. */
  private async useAbilities(view: PlayerView): Promise<void> {
    const abilities = view.me.imposter?.abilities ?? [];
    const now = Date.now() + this.offsetMs;
    const ready = (id: string) => abilities.some((a) => a.id === id && a.readyAt <= now);
    if (view.game?.meeting) return;
    if (ready('taskStop') && view.game?.taskLock === undefined) {
      const res = await this.call('ability:taskStop', {});
      if (res.ok) this.o.log(`${this.o.name}: Task Stop`);
    }
    const base = view.lobby.map.base;
    if (ready('fakeTask') && base) {
      const r = DEFAULT_CONFIG.botFakeScatterM;
      const at = offsetByMeters(base, (this.rng.next() * 2 - 1) * r, (this.rng.next() * 2 - 1) * r);
      const res = await this.call('ability:fakeTask', at);
      if (res.ok) this.o.log(`${this.o.name}: planted a fake task`);
    }
  }

  private allowed(view: PlayerView, p: LatLng): boolean {
    const { boundary, noGo } = view.lobby.map;
    return (
      !!boundary && pointInRing(p, boundary.ring) && !noGo.some((zone) => pointInRing(p, zone))
    );
  }

  /** The card to work on and the place to walk to for it, or nothing when the bot is just wandering. */
  private target(view: PlayerView): { card: TaskCard; goal: LatLng | undefined } | undefined {
    if (view.lobby.phase !== 'playing') return undefined;
    const tasks = view.game?.tasks ?? [];
    // A co-op card first (the last one is the partner slot), so pairs really meet; then the first card.
    const card = tasks.filter((t) => t.kind === 'coop').at(-1) ?? tasks[0];
    if (!card) return undefined;
    if (this.job?.taskId !== card.id) this.job = { taskId: card.id, spot: undefined };
    if (card.stage === 'pin') return { card, goal: { lat: card.lat, lng: card.lng } };
    this.job.spot ??= pointInSection(
      view.lobby.map.regions,
      { regionId: card.regionId, section: card.section },
      DEFAULT_CONFIG.sectionCentreRatio,
      this.rng,
    );
    return { card, goal: this.job.spot };
  }

  /**
   * A co-op card at the pin: start the session (or join a waiting partner), then type the partner's PIN
   * from the shared board. A bot that waits as owner while it is also somebody's partner goes to help first.
   */
  private async coopWork(view: PlayerView, card: TaskCard): Promise<void> {
    const coop = view.game?.coop;
    const tag = view.me.tag;
    if (coop?.puzzle && tag) PIN_BOARD.set(tag, coop.puzzle.show);
    if (!coop) {
      this.coopDoneAt = undefined;
      if (card.stage !== 'pin' || !card.atPin) return;
      await this.call(card.partnerWaiting ? 'coop:join' : 'coop:start', { taskId: card.id });
      return;
    }
    if (coop.phase === 'waiting') {
      const helping = (view.game?.tasks ?? []).filter((t) => t.kind === 'coop').at(-1);
      if (helping && helping.id !== coop.taskId)
        await this.call('coop:cancel', { taskId: coop.taskId });
      return;
    }
    const partnerShows = card.partnerTag ? PIN_BOARD.get(card.partnerTag) : undefined;
    if (partnerShows === undefined) return;
    const { botTaskMinS, botTaskMaxS } = DEFAULT_CONFIG;
    this.coopDoneAt ??=
      Date.now() +
      ((botTaskMinS + this.rng.next() * (botTaskMaxS - botTaskMinS)) * MS_PER_S) / this.o.speed;
    if (Date.now() < this.coopDoneAt) return;
    const res = await this.call('coop:submit', {
      taskId: coop.taskId,
      answer: { pin: partnerShows },
    });
    if (res.ok) {
      this.o.log(`${this.o.name}: typed a co-op PIN`);
      this.coopDoneAt = undefined;
    }
  }

  /** At the pin: open the task once, then finish it after a random wait. */
  private async work(view: PlayerView, card: TaskCard): Promise<void> {
    if (card.kind === 'coop') return this.coopWork(view, card);
    const job = this.job;
    if (!job || card.stage !== 'pin' || !card.atPin) return;
    if (!job.opened) {
      const res = await this.call('task:open', { taskId: card.id });
      if (!res.ok) return;
      job.opened = true;
      const { botTaskMinS, botTaskMaxS } = DEFAULT_CONFIG;
      const waitS = botTaskMinS + this.rng.next() * (botTaskMaxS - botTaskMinS);
      job.doneAt = Date.now() + (waitS * MS_PER_S) / this.o.speed;
      return;
    }
    if (job.doneAt !== undefined && Date.now() >= job.doneAt) {
      const res = await this.call('dev:autoComplete', { taskId: card.id });
      if (res.ok) this.o.log(`${this.o.name}: finished a task`);
      else job.opened = false; // reset (for example the bot drifted away): open it again
      delete job.doneAt;
    }
  }

  /** In a meeting: walk to the Base, skip the discussion, vote once. Returns where to walk, or `stay`. */
  private async meet(view: PlayerView): Promise<LatLng | 'stay' | undefined> {
    const meeting = view.game?.meeting;
    if (view.lobby.phase !== 'playing') return undefined;
    if (!meeting) {
      this.actedIn = undefined;
      return this.maybeCall(view);
    }
    if (view.me.status !== 'active') return 'stay';
    const key = `${meeting.calledBy}|${meeting.stage}`;
    if (meeting.stage === 'discuss' && this.actedIn !== key) {
      this.actedIn = key;
      await this.call('meeting:skipDiscussion', {});
    } else if (meeting.stage === 'vote' && meeting.myVote === undefined && this.actedIn !== key) {
      this.actedIn = key;
      await this.call('meeting:vote', { target: this.voteOf(view) });
    }
    const base = view.lobby.map.base;
    return meeting.gathered.includes(view.me.id) || !base ? 'stay' : base;
  }

  /** A random active player (not itself, not an ally), or Skip. */
  private voteOf(view: PlayerView): string {
    if (this.rng.next() * 100 < DEFAULT_CONFIG.botVoteSkipPercent) return 'skip';
    const allies = new Set((view.me.imposter?.allies ?? []).map((a) => a.playerId));
    const candidates = (view.game?.meeting?.roster ?? []).filter(
      (r) => r.status === 'active' && r.playerId !== view.me.id && !allies.has(r.playerId),
    );
    return candidates[this.rng.int(0, candidates.length - 1)]?.playerId ?? 'skip';
  }

  /** `meetings: 'random'`: call the one meeting this bot has, once its random time has come. */
  private async maybeCall(view: PlayerView): Promise<undefined> {
    if (this.o.meetings !== 'random' || view.me.status !== 'active') return undefined;
    if ((view.game?.meetingsLeft ?? 0) === 0) return undefined;
    const { botMeetingMinS: min, botMeetingMaxS: max } = DEFAULT_CONFIG;
    this.callAt ??= Date.now() + ((min + this.rng.next() * (max - min)) * MS_PER_S) / this.o.speed;
    if (Date.now() < this.callAt) return undefined;
    // A refused call (too early, a cooldown) is tried again in a few seconds.
    const res = await this.call('meeting:call', {});
    if (res.ok) this.o.log(`${this.o.name}: called a meeting`);
    else this.callAt = Date.now() + RETRY_CALL_MS;
    return undefined;
  }

  /** One tick: move, report the position, ready up in the lobby, and work on a task. */
  private async step(): Promise<void> {
    const view = this.view;
    if (!view || view.lobby.phase === 'ended') {
      if (view?.lobby.phase === 'ended') this.stop();
      return;
    }
    const walker = this.walkerFor(view);
    if (!walker) return;
    const { spawn } = view.me;
    const meet = await this.meet(view);
    const inMeeting = view.game?.meeting !== undefined;
    const work = inMeeting ? undefined : this.target(view);
    const working =
      (work?.card.stage === 'pin' && work.card.atPin) || view.game?.coop !== undefined;
    const hunt = inMeeting ? undefined : await this.hunt(view, walker);
    if (meet === 'stay') walker.stay();
    else if (meet) walker.step(meet);
    else if (working) walker.stay();
    else if (hunt) walker.step(hunt.to);
    else {
      walker.step(view.lobby.phase === 'spawning' && spawn && !spawn.reached ? spawn : work?.goal);
    }
    const at = walker.fix();
    this.socket.emit('loc:update', {
      lat: at.lat,
      lng: at.lng,
      accuracy: BOT_ACCURACY_M,
      ts: Date.now() + this.offsetMs,
    });
    if (view.lobby.phase === 'lobby' && !view.me.ready && view.me.location?.quality === 'good') {
      await this.call('lobby:setReady', { ready: true });
    }
    if (work) await this.work(view, work.card);
  }
}
