/**
 * Vote counting and what an ejection does (MEETINGS §4–§5, RULES §8, E25–E28).
 * Every ejected player becomes a spectator and the vote always reveals their
 * role (ADR-019), never their tag, class or infection. A wrongly ejected crew
 * member counts as compromised; an infected one was already counted (E26). Pure.
 */
import { type MeetingTally, resolveVote } from '@afterdark/shared';

import type { PlayerState, RoomState } from '../state';
import { activePlayers } from './players';

export const SKIP = 'skip';

/** The tally lines for the result screen: one per active player (zero included), then Skip. Sorted by count, ties in join order, so the order says nothing about who voted. */
export function countVotes(
  state: RoomState,
  votes: Readonly<Record<string, string>>,
): { tallies: MeetingTally[]; ejectedId: string | undefined } {
  const voters = activePlayers(state);
  const byTarget: Record<string, number> = Object.fromEntries(voters.map((p) => [p.id, 0]));
  let skip = 0;
  for (const voter of voters) {
    const vote = votes[voter.id];
    // A missing vote counts as Skip (MEETINGS §3), and so does a vote for someone no longer a candidate.
    if (vote === undefined || vote === SKIP || byTarget[vote] === undefined) skip++;
    else byTarget[vote] = (byTarget[vote] ?? 0) + 1;
  }
  const order = new Map(voters.map((p, i) => [p.id, i]));
  const tallies: MeetingTally[] = Object.entries(byTarget)
    .map(([target, count]) => ({ target, count }))
    .sort((a, b) => b.count - a.count || (order.get(a.target) ?? 0) - (order.get(b.target) ?? 0));
  tallies.push({ target: SKIP, count: skip });
  return { tallies, ejectedId: resolveVote({ byTarget, skip }) };
}

/** Turns the ejected player into a spectator and applies MEETINGS §5. Returns what to reveal. */
export function eject(p: PlayerState): { wasImposter: boolean } {
  const wasImposter = p.role === 'imposter';
  p.spectator = true;
  if (p.role) p.revealedRole = p.role;
  // Their tasks go (co-op partners get a new one in Phase 10), points already earned stay in the team score.
  delete p.tasks;
  if (wasImposter) {
    // Abilities are gone. Queued fakes are removed with them in Phase 9 (the queue has no owner yet).
    delete p.infect;
  } else if (p.infection !== 'infected') {
    // Healthy or exposed crew: compromised from now on, any exposure cancelled. An infected one is already counted.
    delete p.infection;
    delete p.exposure;
    p.wronglyEjected = true;
  }
  return { wasImposter };
}
