/**
 * The vote rule (MEETINGS §4). Pure and shared, so the engine decides and tests
 * can state the rule once.
 */

export interface VoteCounts {
  /** Votes per candidate, for every candidate (zero included). */
  byTarget: Readonly<Record<string, number>>;
  /** Skip votes **including** every missing vote (a non-vote counts as Skip). */
  skip: number;
}

/**
 * The ejected player: the single candidate with the highest count, **only if**
 * that count is strictly above Skip and nobody ties with it. Otherwise nobody
 * (E25). `undefined` means "No one was ejected".
 */
export function resolveVote(counts: VoteCounts): string | undefined {
  let top = 0;
  let leaders: string[] = [];
  for (const [target, count] of Object.entries(counts.byTarget)) {
    if (count > top) {
      top = count;
      leaders = [target];
    } else if (count === top && count > 0) {
      leaders.push(target);
    }
  }
  const [only] = leaders;
  return leaders.length === 1 && only !== undefined && top > counts.skip ? only : undefined;
}
