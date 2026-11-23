/** Pure helpers for the results screen: copy, ordering, the score chart's geometry and the share text (Phase 12). */
import type {
  EndReason,
  ResultsMeeting,
  ResultsPlayer,
  ResultsScorePoint,
  ResultsTimelineEntry,
  ResultsTimelineKind,
  ResultsView,
  Winner,
} from '@afterdark/shared';

import { formatClock } from '../game/format';

const MS_PER_S = 1000;

export type BannerTone = 'crew' | 'imposters' | 'draw' | 'aborted';

export interface Banner {
  title: string;
  reason: string;
  tone: BannerTone;
}

const REASON_TEXT: Record<EndReason, string> = {
  score: 'The crew reached the target score.',
  ejection: 'Every imposter was ejected.',
  infection: 'Enough of the crew was compromised.',
  time: 'Time ran out. The side with more progress wins.',
  forfeit: 'The other side left the game.',
  abort: 'The host ended the game. These are the stats so far.',
};

/** The winner banner: crew blue, imposter red, a draw or an abort (never colour alone, the title says it too). */
export function bannerFor(winner: Winner, reason: EndReason): Banner {
  if (reason === 'abort')
    return { title: 'Aborted by host', reason: REASON_TEXT.abort, tone: 'aborted' };
  const tone: BannerTone =
    winner === 'crew' ? 'crew' : winner === 'imposters' ? 'imposters' : 'draw';
  const title =
    winner === 'crew' ? 'Crew wins' : winner === 'imposters' ? 'Imposters win' : 'It’s a draw';
  return { title, reason: REASON_TEXT[reason], tone };
}

/** Game seconds as `m:ss` (the match clock a player saw). */
export const clockOfSeconds = (s: number): string => formatClock(s * MS_PER_S);

/** Highest personal score first; ties go to more tasks, then the name, so the order never flickers. */
export function leaderboard(players: readonly ResultsPlayer[]): ResultsPlayer[] {
  return [...players].sort(
    (a, b) =>
      b.personalScore - a.personalScore ||
      b.tasksDone - a.tasksDone ||
      a.username.localeCompare(b.username),
  );
}

/** Imposters first in the reveal grid (the twist), then crew; join order inside each group. */
export function revealOrder(players: readonly ResultsPlayer[]): ResultsPlayer[] {
  return [
    ...players.filter((p) => p.role === 'imposter'),
    ...players.filter((p) => p.role === 'crew'),
  ];
}

export const ROLE_LABEL = { crew: 'Crew', imposter: 'Imposter' } as const;
export const CLASS_LABEL = {
  saboteur: 'Saboteur',
  phantom: 'Phantom',
  camouflage: 'Camouflage',
} as const;

/** Name lookup for ids in the log; a player who is gone is still in `players`, so this only falls back for safety. */
export const nameOf = (results: Pick<ResultsView, 'players'>, id: string | undefined): string =>
  results.players.find((p) => p.id === id)?.username ?? 'Someone';

export const TIMELINE_ICON: Record<ResultsTimelineKind, string> = {
  exposed: '🧪',
  infected: '☣️',
  ejected: '🗳️',
  taskStop: '⛔',
  fakePlanted: '📍',
  camouflage: '🎭',
  paused: '⏸️',
  resumed: '▶️',
};

/** One line of the timeline, in words: "Ana exposed Ben", "Ben became infected (exposed by Ana)". */
export function timelineText(
  results: Pick<ResultsView, 'players'>,
  e: ResultsTimelineEntry,
): string {
  const actor = nameOf(results, e.actorId);
  const target = nameOf(results, e.targetId);
  switch (e.kind) {
    case 'exposed':
      return `${actor} exposed ${target}`;
    case 'infected':
      return `${target} became infected (exposed by ${actor})`;
    case 'ejected': {
      const p = results.players.find((x) => x.id === e.targetId);
      return `${target} was ejected${p ? ` (${ROLE_LABEL[p.role]})` : ''}`;
    }
    case 'taskStop':
      return `${actor} jammed the systems with Task Stop`;
    case 'fakePlanted':
      return `${actor} planted a fake task`;
    case 'camouflage':
      return `${actor} disguised as crew`;
    case 'paused':
      return 'The host paused the game';
    case 'resumed':
      return 'The game resumed';
  }
}

/** A meeting's summary line and its tally rows (never who voted). */
export function meetingText(
  results: Pick<ResultsView, 'players'>,
  m: ResultsMeeting,
): {
  headline: string;
  outcome: string;
  rows: { label: string; count: number; ejected: boolean }[];
} {
  const outcome = m.ejectedId
    ? `${nameOf(results, m.ejectedId)} was ejected (${m.wasImposter ? 'Imposter' : 'not an Imposter'})`
    : 'No one was ejected';
  const rows = m.tallies
    .filter((t) => t.count > 0)
    .map((t) => ({
      label: t.target === 'skip' ? 'Skip' : nameOf(results, t.target),
      count: t.count,
      ejected: t.target === m.ejectedId,
    }));
  return {
    headline: `${clockOfSeconds(m.atS)} · called by ${nameOf(results, m.calledById)}`,
    outcome,
    rows,
  };
}

export interface ChartGeometry {
  /** SVG polyline `points` for the team score. */
  line: string;
  /** y of the target line, or undefined when the target is above the chart's range. */
  targetY: number | undefined;
  /** The score the top of the chart stands for (the larger of the target and the best score). */
  yMax: number;
  /** The last point, for the end marker. */
  end: { x: number; y: number };
}

/** The score chart in a `width` × `height` box with `pad` margins: x is game time, y is team score from 0 up to the target (or higher). */
export function chartGeometry(
  series: readonly ResultsScorePoint[],
  targetScore: number,
  width: number,
  height: number,
  pad: number,
): ChartGeometry {
  const lastAt = Math.max(1, series.at(-1)?.atS ?? 1);
  const best = Math.max(0, ...series.map((p) => p.team));
  const yMax = Math.max(1, targetScore, best);
  const x = (atS: number) => pad + (atS / lastAt) * (width - 2 * pad);
  const y = (team: number) => height - pad - (team / yMax) * (height - 2 * pad);
  const pts = series.map((p) => ({ x: x(p.atS), y: y(p.team) }));
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return { line, targetY: y(targetScore), yMax, end: pts.at(-1) ?? { x: pad, y: y(0) } };
}

/** A short plain-text summary for the Web Share API (no images, no coordinates; Phase 12.6). */
export function shareText(results: ResultsView, code: string): string {
  const head = bannerFor(results.winner, results.reason);
  const lines = [
    `AfterDark · ${head.title}`,
    `Team score ${results.teamScore}/${results.targetScore} · ${clockOfSeconds(results.durationS)} played · ${results.compromised}/${results.threshold} compromised`,
  ];
  const mvp = results.awards.crewMvp;
  if (mvp) lines.push(`Crew MVP: ${nameOf(results, mvp.playerId)} (${mvp.value} pts)`);
  const top = results.awards.topInfector;
  if (top) lines.push(`Top infector: ${nameOf(results, top.playerId)} (${top.value})`);
  lines.push(`Lobby ${code}`);
  return lines.join('\n');
}
