/** The parts of the results screen (UI_UX §2 › Results, Phase 12): banner, reveal grid, score chart, timeline, leaderboard, meetings. */
import type { ResultsPlayer, ResultsView } from '@afterdark/shared';

import {
  type Banner,
  chartGeometry,
  CLASS_LABEL,
  clockOfSeconds,
  leaderboard,
  meetingText,
  nameOf,
  revealOrder,
  ROLE_LABEL,
  TIMELINE_ICON,
  timelineText,
} from './resultsState';

const CHART_W = 320;
const CHART_H = 140;
const CHART_PAD = 14;
const FLIP_STAGGER_MS = 110;

/** The winner banner: a crew-blue or imposter-red glow, with the title and the reason in words (never colour alone). */
export function WinnerBanner({
  banner,
  results,
}: {
  banner: Banner;
  results: ResultsView | undefined;
}) {
  return (
    <header
      data-testid="winner-banner"
      data-tone={banner.tone}
      className={`results-banner results-banner-${banner.tone} rounded-3xl border px-5 py-8 text-center`}
    >
      <h1 data-testid="ended-title" className="font-display text-4xl font-bold sm:text-5xl">
        {banner.title}
      </h1>
      <p data-testid="ended-reason" className="mt-2 text-muted">
        {banner.reason}
      </p>
      {results && (
        <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
          <Stat label="Team score" value={`${results.teamScore}/${results.targetScore}`} />
          <Stat label="Played" value={clockOfSeconds(results.durationS)} />
          <Stat label="Compromised" value={`${results.compromised}/${results.threshold}`} />
        </dl>
      )}
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/25 px-2 py-2">
      <dt className="text-[0.7rem] tracking-wider text-muted uppercase">{label}</dt>
      <dd className="font-mono text-lg font-semibold">{value}</dd>
    </div>
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="rounded-2xl border border-white/10 bg-surface px-4 py-4"
    >
      <h2 id={id} className="mb-3 font-display text-lg font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function statusLine(p: ResultsPlayer): string[] {
  const out: string[] = [];
  if (p.ejected) out.push('Ejected');
  if (p.infectedAtS !== undefined) out.push(`Infected at ${clockOfSeconds(p.infectedAtS)}`);
  if (p.left) out.push('Left the game');
  return out;
}

/** "Who was who": every card flips in, one after another (still for reduced motion). */
export function WhoWasWho({ players }: { players: ResultsPlayer[] }) {
  return (
    <Section title="Who was who" id="who-title">
      <ul className="grid grid-cols-2 gap-2">
        {revealOrder(players).map((p, i) => (
          <li
            key={p.id}
            data-testid="who-card"
            data-role={p.role}
            className={`flip-in rounded-xl border px-3 py-3 ${
              p.role === 'imposter'
                ? 'border-[#ff3b3b]/60 bg-[#ff3b3b]/10'
                : 'border-[#2e8bff]/50 bg-[#2e8bff]/10'
            }`}
            style={{ animationDelay: `${i * FLIP_STAGGER_MS}ms` }}
          >
            <p className="text-xs font-semibold tracking-widest uppercase">
              <span aria-hidden="true">{p.role === 'imposter' ? '🎭' : '🛡️'}</span>{' '}
              {ROLE_LABEL[p.role]}
            </p>
            <p className="mt-1 truncate font-display text-lg font-bold">{p.username}</p>
            <p className="font-mono text-sm text-muted">{p.tag}</p>
            {p.classes && (
              <p className="mt-1 text-xs text-muted">
                {p.classes.map((c) => CLASS_LABEL[c]).join(' · ')}
              </p>
            )}
            {statusLine(p).map((s) => (
              <p key={s} className="mt-1 text-xs text-muted">
                {s}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** The team score over game time against the target: a small inline SVG, labelled so the colours aren't carrying it. */
export function ScoreChart({ results }: { results: ResultsView }) {
  const { scoreSeries: series, targetScore, teamScore } = results;
  if (series.length < 2) return null;
  const g = chartGeometry(series, targetScore, CHART_W, CHART_H, CHART_PAD);
  return (
    <Section title="Team score" id="chart-title">
      <svg
        data-testid="score-chart"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        role="img"
        aria-label={`Team score over time: ${teamScore} of ${targetScore} after ${clockOfSeconds(results.durationS)}`}
        className="w-full"
      >
        <line
          x1={CHART_PAD}
          x2={CHART_W - CHART_PAD}
          y1={CHART_H - CHART_PAD}
          y2={CHART_H - CHART_PAD}
          className="stroke-white/20"
        />
        {g.targetY !== undefined && (
          <>
            <line
              x1={CHART_PAD}
              x2={CHART_W - CHART_PAD}
              y1={g.targetY}
              y2={g.targetY}
              strokeDasharray="4 4"
              className="stroke-muted"
            />
            <text x={CHART_PAD} y={Math.max(10, g.targetY - 4)} className="fill-muted text-[10px]">
              Target {targetScore}
            </text>
          </>
        )}
        <polyline
          points={g.line}
          fill="none"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-accent"
        />
        <circle cx={g.end.x} cy={g.end.y} r="4" className="fill-accent" />
        <text x={CHART_PAD} y={CHART_H - 2} className="fill-muted text-[10px]">
          0:00
        </text>
        <text
          x={CHART_W - CHART_PAD}
          y={CHART_H - 2}
          textAnchor="end"
          className="fill-muted text-[10px]"
        >
          {clockOfSeconds(results.durationS)}
        </text>
      </svg>
    </Section>
  );
}

/** Awards and the ranked list (SCORING › awards). Votes are never shown per voter. */
export function Leaderboard({ results }: { results: ResultsView }) {
  const { awards } = results;
  const chips: { key: string; label: string; icon: string; text: string }[] = [];
  if (awards.crewMvp)
    chips.push({
      key: 'mvp',
      label: 'Crew MVP',
      icon: '🏅',
      text: `${nameOf(results, awards.crewMvp.playerId)} · ${awards.crewMvp.value} pts`,
    });
  if (awards.topInfector)
    chips.push({
      key: 'infector',
      label: 'Top infector',
      icon: '☣️',
      text: `${nameOf(results, awards.topInfector.playerId)} · ${awards.topInfector.value}`,
    });
  if (awards.mostFooled)
    chips.push({
      key: 'fooled',
      label: 'Most fooled',
      icon: '🪤',
      text: `${nameOf(results, awards.mostFooled.playerId)} · ${awards.mostFooled.value}`,
    });
  return (
    <Section title="Leaderboard" id="board-title">
      {chips.length > 0 && (
        <ul data-testid="awards" className="mb-3 flex flex-col gap-2">
          {chips.map((c) => (
            <li
              key={c.key}
              data-testid={`award-${c.key}`}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
            >
              <span aria-hidden="true" className="text-xl">
                {c.icon}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-xs tracking-wider text-muted uppercase">{c.label}</span>
                <span className="truncate font-semibold">{c.text}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ol data-testid="leaderboard" className="flex flex-col divide-y divide-white/10">
        {leaderboard(results.players).map((p, i) => (
          <li
            key={p.id}
            data-testid="leaderboard-row"
            className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-x-3 py-2"
          >
            <span className="font-mono text-sm text-muted">{i + 1}</span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">
                {p.username}{' '}
                <span className="text-xs font-normal text-muted">{ROLE_LABEL[p.role]}</span>
              </span>
              <span className="block text-xs text-muted">
                {p.tasksDone} tasks · {p.distanceM} m walked
                {p.role === 'imposter' ? ` · ${p.infections} infected` : ''}
                {p.meetingsCalled > 0 ? ` · ${p.meetingsCalled} meeting` : ''}
              </span>
            </span>
            <span className="font-mono text-lg font-semibold">{p.personalScore}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Every notable moment, in order, with an icon and the time on the match clock. */
export function Timeline({ results }: { results: ResultsView }) {
  return (
    <Section title="Timeline" id="timeline-title">
      {results.timeline.length === 0 ? (
        <p className="text-sm text-muted">Nothing notable happened.</p>
      ) : (
        <ol data-testid="timeline" className="flex flex-col gap-2">
          {results.timeline.map((e, i) => (
            <li
              key={`${e.atS}-${e.kind}-${i}`}
              data-testid="timeline-row"
              data-kind={e.kind}
              className="grid grid-cols-[3.2rem_1.5rem_1fr] items-baseline gap-x-2 text-sm"
            >
              <span className="font-mono text-muted">{clockOfSeconds(e.atS)}</span>
              <span aria-hidden="true">{TIMELINE_ICON[e.kind]}</span>
              <span>{timelineText(results, e)}</span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

/** Each meeting: who called it, the counts and what it decided. Never who voted for whom. */
export function MeetingHistory({ results }: { results: ResultsView }) {
  return (
    <Section title="Meetings" id="meetings-title">
      {results.meetings.length === 0 ? (
        <p className="text-sm text-muted">No meetings were held.</p>
      ) : (
        <ol data-testid="meeting-history" className="flex flex-col gap-4">
          {results.meetings.map((m, i) => {
            const t = meetingText(results, m);
            return (
              <li key={`${m.atS}-${i}`} data-testid="meeting-row">
                <p className="text-sm text-muted">{t.headline}</p>
                <p className="font-semibold">{t.outcome}</p>
                <p className="text-sm text-muted">
                  {t.rows.map((r) => `${r.label} ${r.count}`).join(' · ')}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
