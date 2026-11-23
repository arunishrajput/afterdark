/**
 * One bot player over a real socket. It uses only the public protocol: join,
 * ready, `loc:update`. In the spawn phase it walks to its own spawn pin, after
 * that it wanders inside the boundary (v1: no tasks, no infecting; Phase 5+).
 */
import {
  BotWalker,
  type ClientToServerEvents,
  createRng,
  DEFAULT_CONFIG,
  hashSeed,
  type LatLng,
  offsetByMeters,
  type PlayerView,
  pointInRing,
  type Rng,
  type ServerToClientEvents,
} from '@afterdark/shared';
import { io, type Socket } from 'socket.io-client';

type BotSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Accuracy a bot reports: comfortably "good". */
const BOT_ACCURACY_M = 5;
/** Bots start scattered this far around the Base. */
const START_SCATTER_M = 10;
const MS_PER_S = 1000;

export interface BotOptions {
  url: string;
  code: string;
  name: string;
  seed: number;
  speed: number;
  log: (line: string) => void;
}

export class Bot {
  private readonly socket: BotSocket;
  private readonly rng: Rng;
  private view: PlayerView | undefined;
  private walker: BotWalker | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  /** serverTime ≈ Date.now() + offsetMs */
  private offsetMs = 0;
  private lastPhase: string | undefined;

  constructor(private readonly o: BotOptions) {
    this.rng = createRng(hashSeed(`${o.seed}|${o.name}`));
    this.socket = io(o.url, { transports: ['websocket'], reconnection: true });
    this.socket.on('view', (v) => this.onView(v));
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

  /** One tick: move, report the position, and ready up in the lobby. */
  private async step(): Promise<void> {
    const view = this.view;
    if (!view || view.lobby.phase === 'ended') {
      if (view?.lobby.phase === 'ended') this.stop();
      return;
    }
    const walker = this.walkerFor(view);
    if (!walker) return;
    const { spawn } = view.me;
    walker.step(view.lobby.phase === 'spawning' && spawn && !spawn.reached ? spawn : undefined);
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
  }
}
