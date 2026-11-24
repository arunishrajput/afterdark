/**
 * One lobby/game: its state, the 1 Hz ticker and change listeners.
 *
 * Serialisation: `dispatch` and `tick` are synchronous and never await, so on
 * Node's single thread each command or tick runs to completion before the next
 * one starts. That is the Room's command queue; the order is strict.
 */
import { DEFAULT_CONFIG } from '@afterdark/shared';

import { reduce } from '../engine/reduce';
import type { RoomState } from '../engine/state';
import { tick } from '../engine/tick';
import type { Command, Effect, ReduceResult } from '../engine/types';
import type { Logger } from '../logger';

const MS_HUNDREDTHS = 100;

export type RoomListener = (state: RoomState, effects: readonly Effect[]) => void;
/** Runs after every tick commit, with the tick's `now` (used for the 1 Hz radar). */
export type TickListener = (state: RoomState, now: number) => void;

export interface RoomDeps {
  now: () => number;
  /** Where the room reports slow commands and contained errors (always tagged with its code). */
  logger?: Logger;
  /** Wall-clock timer for durations only (never game logic); tests may inject a fake. */
  perfNow?: () => number;
}

export class Room {
  private current: RoomState;
  private readonly listeners = new Set<RoomListener>();
  private readonly tickListeners = new Set<TickListener>();
  private ticker: ReturnType<typeof setInterval> | undefined;

  constructor(
    initial: RoomState,
    private readonly deps: RoomDeps,
  ) {
    this.current = initial;
  }

  get state(): RoomState {
    return this.current;
  }

  get code(): string {
    return this.current.code;
  }

  subscribe(listener: RoomListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onTick(listener: TickListener): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  dispatch(cmd: Command): ReduceResult {
    const startedAt = this.perfNow();
    const res = reduce(this.current, cmd, this.deps.now());
    if (res.ok) this.commit(res.state, res.effects);
    this.logDuration('command', cmd.type, startedAt);
    return res;
  }

  /**
   * Error boundary: an exception in one room's tick (or in a listener it triggers) is logged and
   * contained. The ticker keeps running and the process and other rooms are unaffected.
   */
  tick(): void {
    const startedAt = this.perfNow();
    try {
      const now = this.deps.now();
      const res = tick(this.current, now);
      this.commit(res.state, res.effects);
      for (const l of this.tickListeners) l(this.current, now);
    } catch (err) {
      // Never log the state: it holds positions and secret roles (Invariant 8).
      this.deps.logger?.error({ code: this.code, err }, 'room tick failed');
    }
    this.logDuration('tick', 'tick', startedAt);
  }

  /** Re-run listeners without a state change (e.g. a socket bound and needs a view). */
  notify(): void {
    this.commit(this.current, []);
  }

  start(intervalMs: number): void {
    this.stop();
    this.ticker = setInterval(() => this.tick(), intervalMs);
    this.ticker.unref();
  }

  stop(): void {
    clearInterval(this.ticker);
    this.ticker = undefined;
  }

  private perfNow(): number {
    return (this.deps.perfNow ?? performance.now.bind(performance))();
  }

  private logDuration(kind: 'command' | 'tick', event: string, startedAt: number): void {
    const logger = this.deps.logger;
    if (!logger) return;
    // Hundredths of a millisecond: the load test checks a tick budget of a few ms (ARCHITECTURE §11).
    const ms = Math.round((this.perfNow() - startedAt) * MS_HUNDREDTHS) / MS_HUNDREDTHS;
    const fields = { code: this.code, kind, event, ms };
    if (ms >= DEFAULT_CONFIG.slowCommandMs) logger.warn(fields, 'slow room operation');
    else logger.debug(fields, 'room operation');
  }

  private commit(state: RoomState, effects: readonly Effect[]): void {
    this.current = state;
    for (const l of this.listeners) l(state, effects);
  }
}
