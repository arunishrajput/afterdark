/**
 * Server-clock estimation (PROTOCOL.md › Conventions: clients estimate the
 * offset with `time:ping` and display countdowns from absolute deadlines).
 */

export interface ClockSample {
  rttMs: number;
  /** serverTime ≈ clientTime + offsetMs */
  offsetMs: number;
}

/** One round trip → RTT and offset, assuming the server stamped at the midpoint. */
export function sampleFromPing(sentAt: number, serverTs: number, receivedAt: number): ClockSample {
  const rttMs = Math.max(0, receivedAt - sentAt);
  return { rttMs, offsetMs: serverTs - (sentAt + rttMs / 2) };
}

/** The lowest-RTT sample has the least room for path asymmetry, so trust it. */
export function bestEstimate(samples: readonly ClockSample[]): ClockSample | undefined {
  let best: ClockSample | undefined;
  for (const s of samples) if (!best || s.rttMs < best.rttMs) best = s;
  return best;
}
