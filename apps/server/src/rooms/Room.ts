/**
 * One lobby/game: its state, the 1 Hz ticker and change listeners.
 *
 * Serialisation: `dispatch` and `tick` are synchronous and never await, so on
 * Node's single thread each command or tick runs to completion before the next
 * one starts. That is the Room's command queue; the order is strict.
 */
import { reduce } from '../engine/reduce';
import type { RoomState } from '../engine/state';
import { tick } from '../engine/tick';
import type { Command, Effect, ReduceResult } from '../engine/types';

export type RoomListener = (state: RoomState, effects: readonly Effect[]) => void;

export interface RoomDeps {
  now: () => number;
}

export class Room {
  private current: RoomState;
  private readonly listeners = new Set<RoomListener>();
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

  dispatch(cmd: Command): ReduceResult {
    const res = reduce(this.current, cmd, this.deps.now());
    if (res.ok) this.commit(res.state, res.effects);
    return res;
  }

  tick(): void {
    const res = tick(this.current, this.deps.now());
    this.commit(res.state, res.effects);
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

  private commit(state: RoomState, effects: readonly Effect[]): void {
    this.current = state;
    for (const l of this.listeners) l(state, effects);
  }
}
