/**
 * Game time (ARCHITECTURE §3): real time minus the time the match was stopped.
 * Match end, cooldowns, incubation, co-op expiry and the lock all use game-time
 * deadlines. The clock is plain data in the room state; every function takes
 * `now`, so it is pure (Invariant 5).
 */
import type { ClockView } from '@afterdark/shared';

/** Why the clock is stopped. A host pause and a meeting can overlap (ARCHITECTURE §3). */
export type PauseReason = 'host' | 'meeting';

export interface GameClock {
  /** Game ms accumulated up to `runningSince`. */
  gameMs: number;
  /** Server ms of the last accumulation; set only while the clock runs. */
  runningSince?: number;
  started: boolean;
  /** Everything currently holding the clock stopped. */
  reasons: PauseReason[];
}

export function createClock(): GameClock {
  return { gameMs: 0, started: false, reasons: [] };
}

export const isRunning = (c: GameClock): boolean => c.runningSince !== undefined;

/** Started but held stopped by at least one reason. */
export const isPaused = (c: GameClock): boolean => c.started && c.reasons.length > 0;

export function gameNow(c: GameClock, now: number): number {
  return c.runningSince === undefined ? c.gameMs : c.gameMs + (now - c.runningSince);
}

function stop(c: GameClock, now: number): void {
  c.gameMs = gameNow(c, now);
  delete c.runningSince;
}

/** Begin counting (play starts). Stays stopped if a pause reason is already set. */
export function startClock(c: GameClock, now: number): void {
  c.started = true;
  if (c.reasons.length === 0 && c.runningSince === undefined) c.runningSince = now;
}

export function pauseClock(c: GameClock, reason: PauseReason, now: number): void {
  if (c.reasons.includes(reason)) return;
  stop(c, now);
  c.reasons.push(reason);
}

export function resumeClock(c: GameClock, reason: PauseReason, now: number): void {
  if (!c.reasons.includes(reason)) return;
  c.reasons = c.reasons.filter((r) => r !== reason);
  if (c.started && c.reasons.length === 0) c.runningSince = now;
}

/** Wall-clock time when game time reaches `gameDeadlineMs`, or `undefined` while the clock is stopped. */
export function wallTimeOf(c: GameClock, gameDeadlineMs: number, now: number): number | undefined {
  return isRunning(c) ? now + (gameDeadlineMs - gameNow(c, now)) : undefined;
}

/**
 * The display pair for a deadline: while stopped, `pausedAt` is `now` and `endsAt`
 * is `now + remaining`, so the client's `endsAt − pausedAt` stays constant.
 */
export function clockView(c: GameClock, gameDeadlineMs: number, now: number): ClockView {
  const endsAt = now + (gameDeadlineMs - gameNow(c, now));
  return isRunning(c) || !c.started ? { endsAt } : { endsAt, pausedAt: now };
}
