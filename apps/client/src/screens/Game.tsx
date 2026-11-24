import type { LatLng, PlayerView, TaskCard } from '@afterdark/shared';
import { useState } from 'react';

import { fakeSpotProblem } from '../components/game/abilityState';
import { CoopLayer } from '../components/game/CoopSheet';
import { cardsFor, disguiseOf } from '../components/game/disguise';
import { DisguiseCue } from '../components/game/DisguiseCue';
import { FakePlacerBar } from '../components/game/FakePlacerBar';
import { GameMap } from '../components/game/GameMap';
import { GameSheet } from '../components/game/GameSheet';
import { HudBar, StatusBanner, ZoneGlow } from '../components/game/Hud';
import { ImposterPanel } from '../components/game/ImposterPanel';
import { JamOverlay } from '../components/game/JamOverlay';
import { MapScreen } from '../components/game/MapScreen';
import { StatusRow } from '../components/game/StatusRow';
import { TaskPanel } from '../components/game/TaskPanel';
import { TaskPlayer } from '../components/game/TaskPlayer';
import { Sheet } from '../components/ui/Sheet';
import { useSelfPosition } from '../hooks/useSelfPosition';
import { useServerNow } from '../hooks/useServerNow';
import { SimPanel } from '../sim/SimPanel';
import { useLocation } from '../store/location';

const DISGUISE_REFRESH_MS = 500;

/**
 * The game screen (UI_UX §2–§3, ADR-103): a full-screen map with the HUD floating on top and a
 * sheet at the bottom. Crew get task cards; imposters get the Infect bar. The sheet collapses to
 * one card so more of the map shows. A disguised imposter (Camouflage) gets exactly the crew
 * screen, with decoy cards, a hairline countdown on the top edge and the real controls behind a
 * long press on the timer.
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
  const [expanded, setExpanded] = useState(true);
  // The card being played is kept here: the server drops a card from the view the moment it is
  // completed, and the sheet still has the result to show.
  const [playing, setPlaying] = useState<TaskCard | undefined>();
  const [focus, setFocus] = useState<{ id: string; seq: number } | undefined>();
  // The Phantom's placement mode: the map's centre is where the fake would go.
  const [placing, setPlacing] = useState(false);
  const [center, setCenter] = useState<LatLng | undefined>();
  const lock = game?.taskLock;
  const placingFake = imposter !== undefined && placing;
  const showTasks = (crewLook || cards.length > 0) && !placingFake;
  const hidden = cards.length - 1;

  const sheet = placingFake ? (
    <GameSheet label="Place a fake task" expanded>
      <FakePlacerBar view={view} center={center} onClose={() => setPlacing(false)} />
    </GameSheet>
  ) : (
    <GameSheet
      label={crewLook ? 'Your tasks' : 'Your abilities'}
      expanded={expanded}
      onExpandedChange={setExpanded}
      hint={hidden > 0 ? `Show all ${cards.length} tasks` : 'Show more'}
    >
      {showTasks && (
        <TaskPanel
          view={view}
          self={self}
          cards={cards}
          decoyIds={decoyIds}
          joinOffer={disguise?.join}
          quiet={!crewLook}
          collapsed={!expanded}
          onFocus={(card: TaskCard) => setFocus((f) => ({ id: card.id, seq: (f?.seq ?? 0) + 1 }))}
          onStart={(card: TaskCard) => setPlaying(card)}
        />
      )}
      {me.role === 'imposter' && imposter && !disguise && (
        <ImposterPanel view={view} onPlaceFake={() => setPlacing(true)} />
      )}
      <StatusRow view={view} disguised={disguise !== undefined} />
      {lobby.testMode && expanded && (
        <details className="rounded-xl border border-white/10 p-2">
          <summary className="min-h-11 cursor-pointer text-sm text-muted">GPS simulator</summary>
          <SimPanel />
        </details>
      )}
    </GameSheet>
  );

  return (
    <MapScreen
      testId="game-screen"
      map={(insets) => (
        <>
          <GameMap
            view={view}
            simulated={simulated}
            insets={insets}
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
          {lock && <JamOverlay until={lock.until} insets={insets} />}
          {paused && (
            <div
              role="status"
              data-testid="paused-overlay"
              className="absolute inset-0 z-[1000] grid place-items-center bg-bg/70 backdrop-blur-sm"
              style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
            >
              <p className="font-display text-3xl font-bold tracking-widest">PAUSED</p>
            </div>
          )}
        </>
      )}
      top={
        <>
          <HudBar view={view} onTimerLongPress={disguise ? () => setControls(true) : undefined} />
          <StatusBanner view={view} />
        </>
      }
      bottom={sheet}
    >
      <ZoneGlow active={me.zone?.oob === true} />
      {disguise && <DisguiseCue disguise={disguise} now={now} />}
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
    </MapScreen>
  );
}
