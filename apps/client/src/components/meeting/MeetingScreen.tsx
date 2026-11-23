/**
 * The meeting (UI_UX §2, MEETINGS §3, §7): one full-screen view for every role,
 * in the neutral theme, so nobody in the circle can glance at a phone and see red.
 * Gather (distance to the Base, arrivals) → Discuss (countdown, roster, skip) →
 * Vote (cards, confirm, locked) → Result (tallies, the ejection reveal). It shows
 * the same things to crew and imposters. Big type, so a phone can be held up.
 */
import { DEFAULT_CONFIG, type MeetingView, type PlayerView } from '@afterdark/shared';
import { useEffect, useState } from 'react';

import { useSelfPosition } from '../../hooks/useSelfPosition';
import { useServerNow } from '../../hooks/useServerNow';
import { castVote, skipDiscussion } from '../../net/actions';
import { messageFor } from '../../net/errors';
import { useGame } from '../../store';
import { formatClock, formatDistance } from '../game/format';
import { guidance } from '../game/taskGeo';
import { Button } from '../ui/Button';
import {
  candidates,
  remainingMs,
  revealCopy,
  STAGE_HINT,
  STAGE_TITLE,
  tallyRows,
} from './meetingState';

const REFRESH_MS = 250;
const ALARM_MS = 3500;
const REVEAL_DELAY_MS = 1600;

/** The full-screen alarm when a meeting is called: who called it and where to go. Tap to dismiss. */
function Alarm() {
  const alarm = useGame((s) => s.meetingAlarm);
  // The alarm is on screen until it is tapped away or `ALARM_MS` after it arrived, whichever is first.
  // An alarm that is already old when this screen mounts (a remount mid-meeting) is dismissed from the start.
  const [dismissed, setDismissed] = useState<number | undefined>(() =>
    alarm && Date.now() - alarm.at > ALARM_MS ? alarm.seq : undefined,
  );
  const seq = alarm?.seq;
  const at = alarm?.at;
  useEffect(() => {
    if (seq === undefined || at === undefined) return;
    const t = setTimeout(() => setDismissed(seq), Math.max(0, ALARM_MS - (Date.now() - at)));
    return () => clearTimeout(t);
  }, [seq, at]);
  if (!alarm || dismissed === alarm.seq) return null;
  return (
    <button
      type="button"
      data-testid="meeting-alarm"
      onClick={() => setDismissed(alarm.seq)}
      className="alarm-flash fixed inset-0 z-[3000] grid place-items-center bg-bg/95 px-6 text-center"
    >
      <span>
        <span className="block font-display text-5xl font-bold tracking-widest">MEETING</span>
        <span className="mt-4 block text-2xl">
          <strong>{alarm.by}</strong> called a meeting.
        </span>
        <span className="mt-2 block text-xl text-muted">Go to the Base.</span>
      </span>
    </button>
  );
}

function Countdown({ meeting }: { meeting: MeetingView }) {
  const now = useServerNow(REFRESH_MS, meeting.pausedAt === undefined);
  return (
    <div className="flex flex-col items-center">
      <span
        data-testid="meeting-timer"
        className="font-mono text-7xl font-semibold tabular-nums"
        aria-live="off"
      >
        {formatClock(remainingMs(meeting, now))}
      </span>
      {meeting.pausedAt !== undefined && (
        <span
          data-testid="meeting-paused"
          className="mt-1 font-mono text-xs font-bold tracking-[0.25em] text-danger"
        >
          PAUSED
        </span>
      )}
    </div>
  );
}

function RosterList({
  meeting,
  mark,
}: {
  meeting: MeetingView;
  mark?: (id: string) => string | undefined;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2" data-testid="meeting-roster">
      {meeting.roster.map((r) => (
        <li
          key={r.playerId}
          data-testid="roster-card"
          data-player-id={r.playerId}
          data-status={r.status}
          className={`flex min-h-14 items-center justify-between gap-2 rounded-2xl border border-white/10 bg-surface px-3 py-2 ${r.status === 'spectator' ? 'opacity-50' : ''}`}
        >
          <span className="min-w-0 truncate text-lg font-semibold">
            {r.status === 'spectator' && <span aria-hidden="true">👻 </span>}
            {r.username}
          </span>
          <span className="shrink-0 text-sm text-muted">
            {r.status === 'spectator'
              ? 'out'
              : r.connected
                ? (mark?.(r.playerId) ?? '')
                : 'offline'}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Gather({ view, meeting }: { view: PlayerView; meeting: MeetingView }) {
  const self = useSelfPosition(view);
  const base = view.lobby.map.base;
  const g = self && base ? guidance(self, base, self.heading) : undefined;
  const arrived = meeting.gathered.includes(view.me.id);
  return (
    <>
      <section className="flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-surface px-4 py-4">
        {arrived ? (
          <p data-testid="at-base" className="text-2xl font-semibold">
            ✓ You are at the Base
          </p>
        ) : g ? (
          <>
            <span
              aria-hidden="true"
              className="text-5xl leading-none text-accent"
              style={{ transform: `rotate(${g.arrowDeg}deg)` }}
            >
              ↑
            </span>
            <p data-testid="base-distance" className="font-mono text-3xl tabular-nums">
              {formatDistance(g.distanceM)}
            </p>
            <p className="text-sm text-muted">
              to the Base (inside {DEFAULT_CONFIG.baseRadiusM} m counts)
            </p>
          </>
        ) : (
          <p className="text-muted">Waiting for your location…</p>
        )}
      </section>
      <p data-testid="arrivals" className="text-center text-muted">
        {meeting.progress.done} of {meeting.progress.total} at the Base
      </p>
      <RosterList
        meeting={meeting}
        mark={(id) => (meeting.gathered.includes(id) ? '✓' : undefined)}
      />
    </>
  );
}

function Discuss({ meeting, spectator }: { meeting: MeetingView; spectator: boolean }) {
  const [sent, setSent] = useState(false);
  const pushToast = useGame((s) => s.pushToast);
  const skip = async () => {
    setSent(true);
    const res = await skipDiscussion();
    if (!res.ok) {
      setSent(false);
      pushToast(messageFor(res.code));
    }
  };
  return (
    <>
      <RosterList meeting={meeting} />
      {!spectator && (
        <Button
          data-testid="skip-to-vote"
          disabled={sent}
          onClick={() => void skip()}
          className="min-h-14 text-lg"
        >
          {sent ? `Waiting… ${meeting.progress.done}/${meeting.progress.total}` : 'Skip to vote'}
        </Button>
      )}
    </>
  );
}

function Vote({ meeting, spectator }: { meeting: MeetingView; spectator: boolean }) {
  const [picked, setPicked] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const pushToast = useGame((s) => s.pushToast);
  const locked = meeting.myVote !== undefined;
  const nameOf = (id: string) =>
    id === 'skip' ? 'Skip' : (meeting.roster.find((r) => r.playerId === id)?.username ?? '');
  const confirm = async () => {
    if (!picked) return;
    setBusy(true);
    const res = await castVote(picked);
    setBusy(false);
    if (!res.ok) pushToast(messageFor(res.code));
  };
  if (spectator) return <RosterList meeting={meeting} />;
  return (
    <>
      <ul className="grid grid-cols-2 gap-2">
        {[
          ...candidates(meeting).map((r) => ({ id: r.playerId, label: r.username })),
          { id: 'skip', label: 'Skip' },
        ].map((c) => {
          const chosen = (locked ? meeting.myVote : picked) === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                data-testid={c.id === 'skip' ? 'vote-skip' : 'vote-card'}
                data-player-id={c.id}
                aria-pressed={chosen}
                disabled={locked}
                onClick={() => setPicked(c.id)}
                className={`min-h-16 w-full rounded-2xl border px-3 py-2 text-lg font-semibold transition ${chosen ? 'border-accent bg-accent/15 shadow-[0_0_14px_var(--accent-glow)]' : 'border-white/10 bg-surface'} ${c.id === 'skip' ? 'col-span-2 text-muted' : ''}`}
              >
                {c.label}
              </button>
            </li>
          );
        })}
      </ul>
      {locked ? (
        <p data-testid="vote-locked" className="text-center text-lg font-semibold">
          Your vote is locked: {nameOf(meeting.myVote ?? '')}
        </p>
      ) : (
        <Button
          data-testid="vote-confirm"
          disabled={!picked || busy}
          onClick={() => void confirm()}
          className="min-h-14 text-lg"
        >
          {picked ? `Lock in: ${nameOf(picked)}` : 'Pick someone'}
        </Button>
      )}
      <p data-testid="votes-in" className="text-center text-muted">
        {meeting.progress.done} of {meeting.progress.total} voted
      </p>
    </>
  );
}

function Result({ meeting }: { meeting: MeetingView }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  const rows = tallyRows(meeting);
  const reveal = revealCopy(meeting.outcome);
  return (
    <>
      <ul data-testid="meeting-tallies" className="flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.target}
            data-testid="tally-row"
            data-ejected={r.ejected}
            className="rounded-2xl border border-white/10 bg-surface px-3 py-2"
          >
            <div className="flex items-baseline justify-between text-lg font-semibold">
              <span>{r.label}</span>
              <span className="font-mono tabular-nums">{r.count}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${r.share * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p
        data-testid="meeting-reveal"
        data-kind={revealed ? reveal.kind : 'hidden'}
        aria-live="polite"
        className={`reveal min-h-16 text-center font-display text-3xl font-bold ${revealed ? 'reveal-in' : 'opacity-0'}`}
      >
        {revealed ? reveal.headline : ''}
      </p>
    </>
  );
}

export function MeetingScreen({ view, meeting }: { view: PlayerView; meeting: MeetingView }) {
  const spectator = view.me.status === 'spectator';
  return (
    <main
      data-testid="meeting-screen"
      data-stage={meeting.stage}
      className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <Alarm />
      <header className="text-center">
        <p className="text-xs font-semibold tracking-[0.3em] text-muted uppercase">
          Emergency meeting · called by {meeting.calledBy}
        </p>
        <h1 data-testid="meeting-stage" className="mt-1 font-display text-4xl font-bold">
          {STAGE_TITLE[meeting.stage]}
        </h1>
        <p className="text-muted">
          {spectator ? 'You are spectating.' : STAGE_HINT[meeting.stage]}
        </p>
      </header>
      {meeting.stage !== 'result' && <Countdown meeting={meeting} />}
      {meeting.stage === 'gather' && <Gather view={view} meeting={meeting} />}
      {meeting.stage === 'discuss' && <Discuss meeting={meeting} spectator={spectator} />}
      {meeting.stage === 'vote' && <Vote meeting={meeting} spectator={spectator} />}
      {meeting.stage === 'result' && <Result meeting={meeting} />}
    </main>
  );
}
