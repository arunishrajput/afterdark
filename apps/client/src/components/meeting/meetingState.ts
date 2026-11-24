/** Pure helpers for the meeting screens: copy, timers and tally rows (MEETINGS §3–§4). */
import type {
  AnonDot,
  DotFlag,
  MeetingOutcome,
  MeetingStage,
  MeetingTally,
  MeetingView,
} from '@afterdark/shared';

export const STAGE_TITLE: Record<MeetingStage, string> = {
  gather: 'Go to the Base',
  discuss: 'Discuss',
  vote: 'Vote',
  result: 'Result',
};

/** The line under the stage title: what the players should be doing right now. */
export const STAGE_HINT: Record<MeetingStage, string> = {
  gather: 'Walk to the Base. Do not run.',
  discuss: 'Talk it over face to face.',
  vote: 'Pick one player, or skip. Your vote is final.',
  result: 'The votes are in.',
};

/** Time left in the stage, frozen while the host has paused. Never negative. */
export function remainingMs(m: Pick<MeetingView, 'endsAt' | 'pausedAt'>, now: number): number {
  return Math.max(0, m.endsAt - (m.pausedAt ?? now));
}

/** The ejection reveal (ADR-019): always Imposter / Not an imposter, never anything else. */
export function revealCopy(outcome: MeetingOutcome | undefined): {
  headline: string;
  kind: 'imposter' | 'crew' | 'none';
} {
  if (!outcome?.ejectedUsername) return { headline: 'No one was ejected', kind: 'none' };
  return outcome.wasImposter
    ? { headline: `${outcome.ejectedUsername} was an Imposter`, kind: 'imposter' }
    : { headline: `${outcome.ejectedUsername} was not an Imposter`, kind: 'crew' };
}

export interface TallyRow {
  target: string;
  label: string;
  count: number;
  /** 0–1 against the largest count, for the bar. */
  share: number;
  ejected: boolean;
}

/** The result rows with usernames, bars and the ejected row marked. Zero rows are kept so everybody can see they got none. */
export function tallyRows(m: Pick<MeetingView, 'tallies' | 'roster' | 'outcome'>): TallyRow[] {
  const tallies: MeetingTally[] = m.tallies ?? [];
  const top = Math.max(1, ...tallies.map((t) => t.count));
  return tallies.map((t) => ({
    target: t.target,
    label:
      t.target === 'skip'
        ? 'Skip'
        : (m.roster.find((r) => r.playerId === t.target)?.username ?? 'Unknown'),
    count: t.count,
    share: t.count / top,
    ejected: m.outcome?.ejectedId === t.target,
  }));
}

/** Who a vote can go to: every active player in the meeting roster (the voter included, MEETINGS §3). */
export const candidates = (m: Pick<MeetingView, 'roster'>) =>
  m.roster.filter((r) => r.status === 'active');

/** The dot marks anyone may see: an imposter's ally and infection marks never show on a meeting map. */
const PUBLIC_FLAGS: readonly DotFlag[] = ['oob', 'stale'];

/**
 * Radar dots for the map during a meeting (ADR-105): the meeting is neutral for everyone so a glance
 * at a phone in the circle gives nothing away, and an imposter's map must not either.
 */
export const publicDots = (dots: readonly AnonDot[]): AnonDot[] =>
  dots.map((d) => ({ ...d, flags: d.flags.filter((f) => PUBLIC_FLAGS.includes(f)) }));
