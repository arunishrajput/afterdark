/**
 * The meeting's map (ADR-105): while everyone walks to the Base, a player can swap the big
 * countdown screen for the full-screen map, with the Base and its arrival ring, the countdown,
 * the direction and the arrivals in a sheet, and one tap back. It stays neutral for every role:
 * no tasks, no fakes, and radar dots without ally or infection marks.
 */
import { DEFAULT_CONFIG, type MeetingView, type PlayerView } from '@afterdark/shared';

import { useSelfPosition } from '../../hooks/useSelfPosition';
import { useServerNow } from '../../hooks/useServerNow';
import { useLocation } from '../../store/location';
import { formatClock, formatDistance } from '../game/format';
import { GameMap } from '../game/GameMap';
import { GameSheet } from '../game/GameSheet';
import { GameMenu } from '../game/HostMenu';
import { MapScreen } from '../game/MapScreen';
import { guidance } from '../game/taskGeo';
import { Button } from '../ui/Button';
import { remainingMs } from './meetingState';

const REFRESH_MS = 250;
const MEETING_MAP = { baseRadiusM: DEFAULT_CONFIG.baseRadiusM };

export function MeetingMap({
  view,
  meeting,
  onBack,
}: {
  view: PlayerView;
  meeting: MeetingView;
  onBack: () => void;
}) {
  const simOn = useLocation((s) => s.sim.on);
  const now = useServerNow(REFRESH_MS, meeting.pausedAt === undefined);
  const self = useSelfPosition(view);
  const base = view.lobby.map.base;
  const g = self && base ? guidance(self, base, self.heading) : undefined;
  const arrived = meeting.gathered.includes(view.me.id);
  return (
    <MapScreen
      testId="meeting-map"
      map={(insets) => (
        <GameMap
          view={view}
          simulated={view.lobby.testMode && simOn}
          insets={insets}
          meeting={MEETING_MAP}
        />
      )}
      top={
        <header className="flex items-center gap-3 rounded-2xl border border-white/10 bg-surface/90 px-3 py-2 shadow-lg backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-[0.2em] break-words text-muted uppercase">
              Meeting · called by {meeting.calledBy}
            </p>
            <p className="font-display text-lg font-bold">Go to the Base</p>
          </div>
          <span
            data-testid="meeting-map-timer"
            className="font-mono text-2xl font-semibold tabular-nums"
          >
            {formatClock(remainingMs(meeting, now))}
          </span>
          <GameMenu isHost={view.me.isHost} paused={false} canPause={false} />
        </header>
      }
      bottom={
        <GameSheet label="Meeting" expanded>
          <div className="flex items-center gap-3 px-1">
            {arrived ? (
              <p className="flex-1 text-lg font-semibold">✓ You are at the Base</p>
            ) : g ? (
              <>
                <span
                  aria-hidden="true"
                  className="text-3xl leading-none text-accent"
                  style={{ transform: `rotate(${g.arrowDeg}deg)` }}
                >
                  ↑
                </span>
                <p className="min-w-0 flex-1">
                  <span
                    data-testid="meeting-map-distance"
                    className="block font-mono text-2xl tabular-nums"
                  >
                    {formatDistance(g.distanceM)}
                  </span>
                  <span className="block text-xs text-muted">
                    to the Base (inside {DEFAULT_CONFIG.baseRadiusM} m counts). Walk, do not run.
                  </span>
                </p>
              </>
            ) : (
              <p className="flex-1 text-muted">Waiting for your location…</p>
            )}
            <p className="shrink-0 text-right text-sm text-muted tabular-nums">
              {meeting.progress.done}/{meeting.progress.total}
              <span className="block text-xs">at the Base</span>
            </p>
          </div>
          <Button variant="secondary" data-testid="meeting-back" onClick={onBack}>
            Back to the meeting
          </Button>
        </GameSheet>
      }
    />
  );
}
