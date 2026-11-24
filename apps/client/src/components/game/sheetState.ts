/** Pure helpers for the game's bottom sheet (UI_UX §2, ADR-103). */
import type { TaskCard } from '@afterdark/shared';

/**
 * The one card a collapsed sheet shows: the co-op the player is waiting on, else a card at its pin
 * (it has the Start button), else a co-op whose partner is waiting, else the nearest, else the first.
 */
export function priorityCardId(
  cards: readonly TaskCard[],
  {
    waitingId,
    distances,
  }: { waitingId?: string | undefined; distances?: ReadonlyMap<string, number | undefined> },
): string | undefined {
  if (waitingId && cards.some((c) => c.id === waitingId)) return waitingId;
  const atPin = cards.find((c) => c.stage === 'pin' && c.atPin);
  if (atPin) return atPin.id;
  const called = cards.find((c) => c.stage === 'pin' && c.partnerWaiting === true);
  if (called) return called.id;
  let best: { id: string; d: number } | undefined;
  for (const c of cards) {
    const d = distances?.get(c.id);
    if (d !== undefined && (!best || d < best.d)) best = { id: c.id, d };
  }
  return best?.id ?? cards[0]?.id;
}
