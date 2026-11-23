import type { LatLng, PlayerView, TaskCard } from '@afterdark/shared';
import { useState } from 'react';

import { fakeSpotProblem } from '../components/game/abilityState';
import { CoopLayer } from '../components/game/CoopSheet';
import { cardsFor, disguiseOf } from '../components/game/disguise';
import { DisguiseCue } from '../components/game/DisguiseCue';
import { FakePlacerBar } from '../components/game/FakePlacerBar';
import { GameMap } from '../components/game/GameMap';
import { GameMenu } from '../components/game/HostMenu';
import {
  InfectionBoxes,
  MatchTimer,
  StatusBanner,
  TeamScoreBar,
  ZoneGlow,
} from '../components/game/Hud';
import { ImposterPanel } from '../components/game/ImposterPanel';
import { JamOverlay } from '../components/game/JamOverlay';
import { LongPress } from '../components/game/LongPress';
import { MeetingButton } from '../components/game/MeetingButton';
import { TaskPanel } from '../components/game/TaskPanel';
import { TaskPlayer } from '../components/game/TaskPlayer';
import { Sheet } from '../components/ui/Sheet';
import { useSelfPosition } from '../hooks/useSelfPosition';
import { useServerNow } from '../hooks/useServerNow';
import { SimPanel } from '../sim/SimPanel';
import { useLocation } from '../store/location';

const CLASS_NAMES = { saboteur: 'Saboteur', phantom: 'Phantom', camouflage: 'Camouflage' } as const;

const DISGUISE_REFRESH_MS = 500;

/**
 * The game HUD (UI_UX §2–§3): timer, infection boxes, team score, the map, the
 * zone banner and edge glow, and the menu. Crew get task cards; imposters get the Infect bar.
 * A disguised imposter (Camouflage) gets exactly the crew screen, with decoy cards, a hairline
 * countdown on the top edge and the real controls behind a long press on the timer.
 */
export function Game({ view }: { view: PlayerView }) {
  const { me, game, lobby } = view;
  const simOn = useLocation((s) => s.sim.on);
  const simulated = lobby.testMode && simOn;
  const imposter = me.imposter;
  const paused = game?.clock?.pausedAt !== undefined;
  const self = useSelfPosition(view);
  const now = useServerNow(DISGUISE_REFRESH_MS, imposter !== undefined);
  const disguise = disguiseOf(view, now);
  const crewLook = me.role === 'crew' || disguise !== undefined;
  const cards = cardsFor(view, disguise);
  const decoyIds = new Set(disguise?.decoyTasks.map((c) => c.id));
  const [controls, setControls] = useState(false);
  // The card being played is kept here: the server drops a card from the view the moment it is
  // completed, and the sheet still has the result to show.
  const [playing, setPlaying] = useState<TaskCard | undefined>();
  const [focus, setFocus] = useState<{ id: string; seq: number } | undefined>();
  // The Phantom's placement mode: the map's centre is where the fake would go.
  const [placing, setPlacing] = useState(false);
  const [center, setCenter] = useState<LatLng | undefined>();
  const lock = game?.taskLock;

  return (
    <main className="relative mx-auto flex h-dvh max-w-md flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <ZoneGlow active={me.zone?.oob === true} />
      {disguise && <DisguiseCue disguise={disguise} now={now} />}
      <header className="flex items-center gap-3 rounded-2xl border border-white/10 bg-surface px-3 py-2">
        {disguise ? (
          <LongPress onLong={() => setControls(true)}>
            <MatchTimer clock={game?.clock} />
          </LongPress>
        ) : (
          <MatchTimer clock={game?.clock} />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {game?.crewCount !== undefined && game.threshold !== undefined && (
            <InfectionBoxes
              crewCount={game.crewCount}
              compromised={game.compromised ?? 0}
              threshold={game.threshold}
            />
          )}
          <TeamScoreBar score={game?.teamScore ?? 0} target={game?.targetScore ?? 1} />
        </div>
        <GameMenu isHost={me.isHost} paused={paused} canPause />
      </header>

      <StatusBanner view={view} />

      <div className="relative isolate min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10">
        <GameMap
          view={view}
          simulated={simulated}
          tasks={
            crewLook || cards.length > 0
              ? { cards, regions: lobby.map.regions, focusId: focus?.id, focusSeq: focus?.seq }
              : undefined
          }
          fakes={imposter?.fakes}
          placing={
            placing
              ? {
                  onCenter: setCenter,
                  valid: center !== undefined && fakeSpotProblem(view, center) === undefined,
                }
              : undefined
          }
        />
        {lock && <JamOverlay until={lock.until} />}
        {paused && (
          <div
            role="status"
            data-testid="paused-overlay"
            className="absolute inset-0 z-[1000] grid place-items-center bg-bg/70 backdrop-blur-sm"
          >
            <p className="font-display text-3xl font-bold tracking-widest">PAUSED</p>
          </div>
        )}
      </div>

      {(crewLook || cards.length > 0) && !(imposter && placing) && (
        <TaskPanel
          view={view}
          self={self}
          cards={cards}
          decoyIds={decoyIds}
          joinOffer={disguise?.join}
          quiet={!crewLook}
          onFocus={(card: TaskCard) => setFocus((f) => ({ id: card.id, seq: (f?.seq ?? 0) + 1 }))}
          onStart={(card: TaskCard) => setPlaying(card)}
        />
      )}
      {me.role === 'imposter' &&
        imposter &&
        (placing ? (
          <FakePlacerBar view={view} center={center} onClose={() => setPlacing(false)} />
        ) : (
          !disguise && <ImposterPanel view={view} onPlaceFake={() => setPlacing(true)} />
        ))}
      {disguise && controls && (
        <Sheet open={controls} title="Controls" onClose={() => setControls(false)}>
          <ImposterPanel
            view={view}
            onPlaceFake={() => {
              setControls(false);
              setPlacing(true);
            }}
          />
        </Sheet>
      )}
      {playing && <TaskPlayer card={playing} onClose={() => setPlaying(undefined)} />}
      <CoopLayer view={view} />

      <section
        aria-label="Your status"
        className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-surface px-4 py-3"
      >
        <div>
          <p
            data-testid="role-chip"
            className="font-display text-sm font-bold tracking-[0.2em] text-accent"
          >
            {imposter && !disguise
              ? `IMPOSTER · ${imposter.classes
                  .map((c) => CLASS_NAMES[c])
                  .join(' + ')
                  .toUpperCase()}`
              : 'CREW'}
          </p>
          <p data-testid="my-tag" className="font-mono text-sm text-muted">
            Tag {me.tag}
          </p>
          {imposter && !disguise && imposter.allies.length > 0 && (
            <p data-testid="allies-chip" className="text-xs text-muted">
              Allies: {imposter.allies.map((a) => `${a.username} (${a.tag})`).join(', ')}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="font-mono text-sm tabular-nums" data-testid="personal-score">
            <span className="text-muted">You </span>
            {me.personalScore ?? 0}
          </p>
          <MeetingButton left={game?.meetingsLeft ?? 0} paused={paused} />
        </div>
      </section>

      {lobby.testMode && (
        <details className="rounded-xl border border-white/10 p-2">
          <summary className="min-h-11 cursor-pointer text-sm text-muted">GPS simulator</summary>
          <SimPanel />
        </details>
      )}
    </main>
  );
}
