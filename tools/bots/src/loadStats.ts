/** Numbers for `pnpm bots:load` (Phase 14): percentiles, and the server's room-duration log. */

export interface Stats {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

/** Nearest-rank percentile of samples sorted ascending. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? 0;
}

export function statsOf(samples: readonly number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.at(-1) ?? 0,
  };
}

export interface RoomLogSummary {
  /** Distinct lobby codes seen. */
  rooms: number;
  tick: Stats;
  command: Stats;
  /** Operations over `slowCommandMs`, which the server logs at warn. */
  slow: number;
}

interface RoomLine {
  msg?: unknown;
  code?: unknown;
  kind?: unknown;
  ms?: unknown;
}

/**
 * Reads the server's pino JSON log (`LOG_LEVEL=debug`): every room command and tick is a
 * "room operation" line with its duration, or "slow room operation" over `slowCommandMs`.
 */
export function summarizeRoomLog(text: string): RoomLogSummary {
  const ticks: number[] = [];
  const commands: number[] = [];
  const rooms = new Set<string>();
  let slow = 0;
  for (const raw of text.split('\n')) {
    if (!raw.startsWith('{')) continue;
    let line: RoomLine;
    try {
      line = JSON.parse(raw) as RoomLine;
    } catch {
      continue;
    }
    if (line.msg !== 'room operation' && line.msg !== 'slow room operation') continue;
    if (typeof line.ms !== 'number') continue;
    if (typeof line.code === 'string') rooms.add(line.code);
    if (line.msg === 'slow room operation') slow++;
    (line.kind === 'tick' ? ticks : commands).push(line.ms);
  }
  return { rooms: rooms.size, tick: statsOf(ticks), command: statsOf(commands), slow };
}
