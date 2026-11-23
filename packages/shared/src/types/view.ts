/**
 * Per-player view snapshots (PROTOCOL.md › PlayerView). The server builds these
 * from an allow-list in `projectView()`; every field must be allowed by the
 * ROLES.md visibility matrix and covered by a leak test.
 */
import type { GameConfigEditable } from '../config/schema';
import type { TaskPointSource } from '../geo/pool';
import type { SectionId } from '../geo/sections';
import type { LatLng, MultiPolygonCoords, Position, Ring } from '../geo/types';
import type { LockAction, LockFeedback, LockPuzzle } from '../minigames/lock';
import type { WiresAnswer, WiresPuzzle } from '../minigames/wires';
import type { EndReason, ImposterClass, Phase, PlayerStatus, Role, Winner } from './domain';

/**
 * Config every player sees in the lobby: the host-editable keys. Fixed (🔒)
 * keys are constants, so clients read them from `DEFAULT_CONFIG` (ADR-035).
 */
export type GameConfigPublic = GameConfigEditable;

/** One roster row. Public to everyone in the lobby. */
export interface PublicPlayer {
  id: string;
  username: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  status: PlayerStatus;
  /** Set once the player has been ejected: the meeting reveal is public to everyone (ADR-019). */
  revealedRole?: Role;
}

/** One of a region's 9 sections: its area and whether tasks can be sent there. */
export interface SectionStat {
  id: SectionId;
  areaM2: number;
  usable: boolean;
}

/** A region with its compass frame. Section polygons are not sent: clients derive them from this (`sectionShapes`). */
export interface RegionPublic {
  id: string;
  name: string;
  /** `[lng, lat]` multi-polygon (several parts when a no-go zone splits the region). */
  area: MultiPolygonCoords;
  origin: LatLng;
  rhoM: number;
  areaM2: number;
  sections: SectionStat[];
}

/** A task point as the lobby shows it for safety review. Never sent once the game has started. */
export interface TaskPointPublic {
  id: string;
  lat: number;
  lng: number;
  regionId: string;
  section: SectionId;
  source: TaskPointSource;
}

/** Public setup data: every player sees the map (MAP_AND_REGIONS §1). */
export interface MapSetupPublic {
  /** The playable boundary, once the host has set one. */
  boundary?: { ring: Position[]; areaM2: number };
  regions: RegionPublic[];
  /** Lobby only: the pool is hidden during play. */
  taskPoints: TaskPointPublic[];
  noGo: Ring[];
  base?: LatLng;
}

/** Players per region, bucketed (`regionCountBuckets` labels), recounted every `regionCountRefreshS`. */
export interface RegionCount {
  regionId: string;
  bucket: string;
}

/** How the spawn phase is going: public numbers, no names (RULES §4). */
export interface SpawnProgress {
  reached: number;
  total: number;
  /** Server epoch ms when the spawn timeout ends. */
  endsAt: number;
}

/** The match clock as a display pair: remaining time is `endsAt − (pausedAt ?? now)` (ARCHITECTURE §3). */
export interface ClockView {
  /** Server epoch ms when game time runs out, if it keeps running from now. */
  endsAt: number;
  /** Present while the clock is frozen (a host pause). */
  pausedAt?: number;
}

/** Why and how a game ended (the full results screen is Phase 12). */
export interface ResultView {
  winner: Winner;
  reason: EndReason;
}

/** The stages of a meeting, in order (MEETINGS §3). The `Called` instant is the start of `gather`. */
export type MeetingStage = 'gather' | 'discuss' | 'vote' | 'result';

/** One roster row of a meeting: public to everyone, spectators included. */
export interface MeetingRosterEntry {
  playerId: string;
  username: string;
  status: PlayerStatus;
  connected: boolean;
}

/** One line of the result: `target` is a player id or `'skip'`. Never who voted (ROLES.md). */
export interface MeetingTally {
  target: string;
  count: number;
}

/** What the vote decided. No `ejectedId` means nobody was ejected (MEETINGS §4). */
export interface MeetingOutcome {
  ejectedId?: string;
  ejectedUsername?: string;
  /** Always revealed with an ejection, never the tag, class or infection (ADR-019). */
  wasImposter?: boolean;
}

/**
 * The running meeting (MEETINGS). The same shape for every viewer, crew, imposter
 * or spectator: only `myVote` is the viewer's own.
 */
export interface MeetingView {
  stage: MeetingStage;
  /** Server epoch ms when this stage ends, if nothing finishes it early. With `pausedAt`, remaining time is `endsAt − pausedAt`. */
  endsAt: number;
  /** Present while the host has paused the game. */
  pausedAt?: number;
  /** Username of the caller (public, ROLES.md). */
  calledBy: string;
  /** Everyone who has reached the Base so far. */
  gathered: string[];
  roster: MeetingRosterEntry[];
  /** Players who did what this stage waits for: arrived, skipped the discussion or voted (counts only). */
  progress: { done: number; total: number };
  /** The viewer's own vote once cast: a player id or `'skip'`. */
  myVote?: string;
  /** `result` only. */
  tallies?: MeetingTally[];
  /** `result` only. */
  outcome?: MeetingOutcome;
}

/** Solo today; `coop` arrives in Phase 10. */
export type TaskKind = 'solo' | 'coop';

/**
 * One task card (TASKS §1), revealed in stages. `assigned`: only a direction.
 * `pin`: also the exact point and whether the player is within reach. The
 * minigame type and its points are never here: they arrive in the `task:open`
 * ack. A fake task has exactly this shape (Invariant 4).
 */
export type TaskCard =
  | {
      id: string;
      stage: 'assigned';
      kind: TaskKind;
      /** For the Stage 1 highlight: regions are public, so this reveals nothing. */
      regionId: string;
      regionName: string;
      section: SectionId;
      partnerTag?: string;
    }
  | {
      id: string;
      stage: 'pin';
      kind: TaskKind;
      regionId: string;
      regionName: string;
      section: SectionId;
      partnerTag?: string;
      lat: number;
      lng: number;
      atPin: boolean;
    };

/** The puzzle the server sends when a task is opened: never the solution. */
export type TaskOpenAck =
  | { type: 'wires'; points: number; puzzle: WiresPuzzle }
  | { type: 'lock'; points: number; puzzle: LockPuzzle };

export type TaskActionBody = LockAction;
export type TaskActionAck = { feedback: LockFeedback };

/** `fooled` is a fake task finished correctly (Phase 9). */
export type TaskSubmitAck = { result: 'success' | 'wrong' | 'fooled'; points: number };

export type TaskAnswerBody = WiresAnswer | number[];

/**
 * Public game state. Every player gets the same values (ROLES.md visibility
 * matrix): nothing here depends on role or infection, except the viewer's own
 * task cards and cooldown. The optional groups appear with the phase that needs them.
 */
export interface GameView {
  regionCounts: RegionCount[];
  /** `spawning` only. */
  spawn?: SpawnProgress;
  /** `reveal` only: server epoch ms when play begins. */
  revealEndsAt?: number;
  /** `reveal` onwards: infection boxes, team score and the match clock. */
  clock?: ClockView;
  teamScore?: number;
  targetScore?: number;
  compromised?: number;
  threshold?: number;
  crewCount?: number;
  /** The viewer's own remaining meetings (they call their own, MEETINGS §2). */
  meetingsLeft?: number;
  /** While a meeting runs. */
  meeting?: MeetingView;
  /** `playing` only, crew only: the viewer's own cards (an imposter gets none until Phase 10's partner slot). */
  tasks?: TaskCard[];
  /** `playing`, crew only: server epoch ms when the viewer may reroll again; absent when they may now. */
  rerollReadyAt?: number;
  /** While a Task Stop lock runs (public, ROLES.md): nobody can open or submit a task until `until`. Says nothing about who. */
  taskLock?: { until: number };
  /** `ended` only. */
  result?: ResultView;
}

export type LocationQuality = 'good' | 'weak' | 'stale';

/** The player's own latest accepted fix, as the server sees it. */
export interface LocationView {
  lat: number;
  lng: number;
  accuracy: number;
  quality: LocationQuality;
  /** Outside the boundary or inside a no-go zone (RULES §9). */
  oob: boolean;
}

export interface LobbyView {
  code: string;
  phase: Phase;
  hostId: string;
  testMode: boolean;
  config: GameConfigPublic;
  map: MapSetupPublic;
  /** In join order. */
  players: PublicPlayer[];
  /** Server epoch ms when the start countdown ends; absent when none is running. */
  countdownEndsAt?: number;
}

/** The viewer's own spawn point (spawn phase onwards; nobody else's is ever sent). */
export interface SpawnView {
  lat: number;
  lng: number;
  reached: boolean;
}

/** The viewer's own zone state (RULES §9): same shape for every role. */
export interface ZoneView {
  oob: boolean;
  /** Server epoch ms when penalties start; only while out of bounds, inside the grace and not paused. */
  graceEndsAt?: number;
}

/** A class ability (RULES §7.2–7.4). Infect is not one: every imposter has it (`InfectView`). */
export type AbilityId = 'taskStop' | 'fakeTask' | 'camouflage';

/** One ability's state, in server epoch ms. `activeUntil` is for abilities with a duration (Camouflage, Phase 10). */
export interface AbilityState {
  id: AbilityId;
  /** When the ability is ready again; in the past when it is ready now. */
  readyAt: number;
  activeUntil?: number;
}

/** A Phantom's own fake task: where it sits and whether a crew slot has taken it yet (ROLES.md: whether a task is fake). */
export interface FakeView {
  id: string;
  lat: number;
  lng: number;
  assigned: boolean;
}

/** Another imposter, as an imposter sees them (ROLES.md: username, tag, class and cooldowns). */
export interface ImposterAlly {
  playerId: string;
  username: string;
  tag: string;
  classes: ImposterClass[];
  abilities: AbilityState[];
}

/** The imposter's own Infect state (RULES §7.1). Times are server epoch ms. */
export interface InfectView {
  /** When Infect is ready again; in the past when it is ready now. */
  readyAt: number;
  /** Present while a channel runs. `inRange` is false during a tolerated gap. */
  channel?: { endsAt: number; inRange: boolean };
}

/** A crew member who completed a channel and is incubating (imposter-only). */
export interface ExposureView {
  playerId: string;
  /** Absent until the exposing imposter has left (RULES §7.1.3). */
  incubationEndsAt?: number;
}

/** Imposter-only information. A crew view has no `imposter` key at all. */
export interface ImposterView {
  classes: ImposterClass[];
  allies: ImposterAlly[];
  infect: InfectView;
  /** The class abilities this imposter can use now (Phase 9: Task Stop, Fake Task). */
  abilities: AbilityState[];
  /** The Phantom's own fakes, queued or handed out (empty for everyone else). */
  fakes: FakeView[];
  /** Everyone exposed or infected, whichever imposter caused it (ROLES.md). */
  compromisedIds: string[];
  /** The subset still incubating; the rest of `compromisedIds` are infected. */
  exposures: ExposureView[];
}

export interface MeView {
  id: string;
  username: string;
  isHost: boolean;
  ready: boolean;
  status: PlayerStatus;
  /** Absent until the server has accepted a fix from this player. */
  location?: LocationView;
  /** Spawn phase onwards. */
  spawn?: SpawnView;
  /** `reveal` onwards: the viewer's own secret tag, role, and (imposters only) the imposter block. */
  tag?: string;
  role?: Role;
  imposter?: ImposterView;
  /** `reveal` onwards. */
  personalScore?: number;
  /** `playing` onwards. */
  zone?: ZoneView;
}

export interface PlayerView {
  /** Increases by one every time this player's view content changes. */
  v: number;
  /** Server epoch ms when the snapshot was built. */
  serverNow: number;
  lobby: LobbyView;
  me: MeView;
  /** Present once the lobby has a region layout (counts are shown in the lobby for testing). */
  game?: GameView;
}

export type DotFlag = 'oob' | 'stale' | 'ally' | 'exposed' | 'infected';

/** An anonymous position: no player id, no username, and an alias that rotates (MAP_AND_REGIONS §6). */
export interface AnonDot {
  alias: string;
  lat: number;
  lng: number;
  flags: DotFlag[];
}

export interface RadarPayload {
  dots: AnonDot[];
  /** Server epoch ms. */
  at: number;
}

/** Toast / overlay triggers (PROTOCOL.md › GameEvent). */
export type GameEvent =
  | { type: 'lobby.countdown'; endsAt: number }
  | { type: 'lobby.countdownCancelled' }
  /** The host changed the settings, so everyone was un-readied (RULES §3.6). */
  | { type: 'lobby.configChanged' }
  /** The host changed the boundary, so everyone was un-readied (RULES §3.6). */
  | { type: 'lobby.mapChanged' }
  /** The countdown ended but the game could not start (E3: the area is too small to spread everyone out). */
  | { type: 'lobby.startFailed'; reason: 'spawns' }
  | { type: 'game.spawnStarted' }
  | { type: 'game.rolesRevealed' }
  | { type: 'game.playStarted' }
  | { type: 'game.paused' }
  | { type: 'game.resumed' }
  | { type: 'game.ended'; winner: Winner; reason: EndReason }
  /** Private to the player who is out of bounds (RULES §9.2). */
  | { type: 'zone.warning' }
  | { type: 'zone.penalty'; points: number }
  /** Private (Phase 5): a task's pin was revealed (Stage 2). */
  | { type: 'task.revealed' }
  /** Private: the player is within reach of a task's pin. */
  | { type: 'task.atPin' }
  /** Private: a task was completed for `points`. */
  | { type: 'task.completed'; points: number }
  /** Private: a minigame in progress was reset (the player left the pin, lost GPS, left the zone or reconnected). */
  | {
      type: 'task.reset';
      reason: 'range' | 'gps' | 'zone' | 'connection' | 'meeting' | 'sabotage';
    }
  /** Private: a task was replaced because its point was reported unsafe (by anyone). */
  | { type: 'task.removed'; reason: 'unsafe' }
  /** Public (Phase 7): a crew member just became compromised. Says nothing about who. */
  | { type: 'game.compromised'; count: number }
  /** Private to the imposter (Phase 7): their Infect channel finished. The target is never told. */
  | { type: 'infect.completed' }
  /** Private to the imposter: their channel failed (no cooldown). `range` is a gap beyond the tolerance, `target` means the target stopped being eligible (E6, E7), `meeting` means a meeting was called. */
  | { type: 'infect.failed'; reason: 'range' | 'target' | 'meeting' }
  /** Public (Phase 9): a Task Stop began. Every phone shows SYSTEMS JAMMED until `until` (server epoch ms). Says nothing about who. */
  | { type: 'sabotage.started'; until: number }
  /** Public (Phase 8): a meeting was called by `by` (a username). Every phone shows the alarm. */
  | { type: 'meeting.called'; by: string }
  /** Public: the vote is over. `ejected` is absent when nobody was ejected. */
  | { type: 'meeting.result'; ejected?: { username: string; wasImposter: boolean } };

/** The ack of `ability:taskStop`: when the lock ends (server epoch ms). */
export interface TaskStopAck {
  lockEndsAt: number;
}

/** The ack of `ability:fakeTask`: the id the fake will carry as a task. */
export interface FakeTaskAck {
  fakeId: string;
}

/** The ack of `ability:infect`. */
export interface InfectAck {
  channelEndsAt: number;
}
