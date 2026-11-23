# Network Protocol (Socket.IO)

This file is the contract between `apps/client` and `apps/server`. The code copy is `packages/shared/src/protocol/`:
- `events.ts` holds event names and TypeScript maps.
- `schemas.ts` holds the zod schemas.

**Keep this doc and the code identical.** Phases add events as they need them; each phase file says which ones to add.

## Conventions
- **Transport:** one Socket.IO connection per tab, on the same origin as the client. In dev, the Vite proxy forwards `/socket.io`.
- **Client → server events** always carry a payload object and an **ack callback**. The server validates every payload with zod **before** any logic runs. An invalid payload gets `{ok:false, error:{code:'INVALID_PAYLOAD'}}` and is logged.
  ```ts
  type Ack<T = void> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } };
  ```
- **Server → client events** never include data the recipient isn't entitled to (see [ROLES.md](ROLES.md#visibility-matrix)). There is **no** `io.to(room).emit(...)` carrying private data. Broadcasts are allowed only for payloads that are identical for every player and contain only public information.
- **Times** are server epoch milliseconds. Clients estimate `offset` with `time:ping` and display countdowns from absolute deadlines (`endsAt`), never by counting ticks themselves.
- **Rate limits** (Phase 14; basic versions earlier): `loc:update` ≤ 2/s, other events ≤ 10/s per socket. Payloads are capped at 16 KB.
- **IDs** are random, URL-safe, 12+ characters, and never sequential.

## Error codes
`INVALID_PAYLOAD`, `NOT_FOUND`, `LOBBY_FULL`, `GAME_IN_PROGRESS`, `NAME_TAKEN`, `NOT_HOST`, `NOT_ALLOWED`, `WRONG_PHASE`, `COOLDOWN`, `OUT_OF_RANGE`, `WEAK_GPS`, `STALE`, `OUT_OF_BOUNDS`, `TASKS_LOCKED`, `MEETING_ACTIVE`, `PAUSED`, `RATE_LIMITED`, `KICKED`, `INTERNAL`.

## Client → server
| Event | Payload | Ack data | Who / when | Phase |
|---|---|---|---|---|
| `time:ping` | `{clientTs}` | `{serverTs}` | anyone | 1 |
| `session:resume` | `{token}` | `{playerId, code}` | on (re)connect | 1 |
| `lobby:create` | `{username, acceptedSafety: true}` | `{code, token, playerId}` | — | 1 |
| `lobby:join` | `{code, username, acceptedSafety: true}` | `{token, playerId}` | lobby phase only | 1 |
| `lobby:leave` | `{}` | — | any time; mid-game the player becomes a permanent disconnect | 1 |
| `lobby:setReady` | `{ready}` | — | lobby; ready needs a good fix (Phase 2 or later) | 1 |
| `lobby:updateConfig` | `{patch: Partial<GameConfigEditable>}` | — | host, lobby; un-readies everyone | 1 |
| `lobby:kick` | `{playerId}` | — | host, lobby | 1 |
| `loc:update` | `{lat, lng, accuracy, ts, heading?, speed?}` | none (volatile emit, no ack) | in a lobby | 2 |
| `lobby:setBoundary` | `{boundary: {type:'polygon', coords: [lng,lat][]} \| {type:'circle', center:{lat,lng}, radiusM}}` | `{areaM2}` | host | 2 |
| `lobby:regenerateRegions` | `{regionCount?: 'auto' \| 2..6, seed?}` | — | host | 3 |
| `lobby:renameRegion` | `{regionId, name}` | — | host | 3 |
| `lobby:editTaskPoints` | `{add?: {lat,lng}[], remove?: string[], regenerate?: boolean}` | — | host | 3 |
| `lobby:setNoGoZones` | `{zones: [lng,lat][][]}` | — | host | 3 |
| `lobby:setBase` | `{lat, lng}` | — | host | 3 |
| `game:forceStart` | `{}` | — | host, spawn phase | 4 |
| `game:pause` / `game:resume` | `{}` | — | host, playing | 4 |
| `game:abort` | `{}` | — | host, any game phase | 4 |
| `task:open` | `{taskId}` | `{type, points, puzzle}` | crew, task AT_PIN | 5 |
| `task:action` | `{taskId, action}` | `{feedback}` | multi-step games | 5 |
| `task:submit` | `{taskId, answer}` | `{result: 'success' \| 'wrong' \| 'fooled', points}` | | 5 |
| `task:cancel` | `{taskId}` | — | | 5 |
| `task:reroll` | `{taskId}` | — | cooldown 180 s | 5 |
| `task:reportUnsafe` | `{taskId, reason?}` | — | | 5 |
| `ability:infect` | `{}` | `{channelEndsAt}` | imposter; nearest eligible target is chosen on the server | 7 |
| `ability:cancelInfect` | `{}` | — | | 7 |
| `meeting:call` | `{}` | — | active player | 8 |
| `meeting:skipDiscussion` | `{}` | — | during Discuss | 8 |
| `meeting:vote` | `{target: playerId \| 'skip'}` | — | during Vote, once | 8 |
| `ability:taskStop` | `{}` | `{lockEndsAt}` | Saboteur | 9 |
| `ability:fakeTask` | `{lat, lng}` | `{fakeId}` | Phantom | 9 |
| `ability:camouflage` | `{}` | `{endsAt}` | Camouflage | 10 |
| `coop:start` | `{taskId}` | — | at pin; opens a waiting session | 10 |
| `coop:join` | `{taskId}` | `{puzzle}` | assigned partner, or a camouflaged imposter at a waiting session | 10 |
| `coop:submit` | `{taskId, answer}` | `{result}` | | 10 |
| `lobby:playAgain` | `{}` | — | host, ended | 12 |
| `dev:teleport` | `{lat, lng}` | — | **testMode only** | 2 |
| `dev:addBots` | `{count}` | — | **testMode only**, host | 4 |
| `dev:autoComplete` | `{taskId}` | — | **testMode only** | 5 |

`dev:*` events are rejected with `NOT_ALLOWED` unless the lobby's `testMode` is true. They are also rejected in production when the env var `ALLOW_TEST_MODE=false`.

## Server → client
| Event | Payload | Frequency | Phase |
|---|---|---|---|
| `view` | `PlayerView` (full snapshot for that player) | on change, throttled to `viewThrottleMs` (200 ms) | 1 |
| `radar` | `{dots: AnonDot[], at}` | every `radarIntervalMs` (1 s) during lobby and play | 2 |
| `event` | `GameEvent` (toast or overlay trigger) | as they happen | 1 |
| `kicked` | `{reason}` | once | 1 |

### `PlayerView` (outline; the full type is in `shared/src/types/view.ts`)
```ts
interface PlayerView {
  v: number;                    // monotonically increasing per player
  serverNow: number;
  lobby: {
    code: string; phase: Phase; hostId: string; testMode: boolean;
    config: GameConfigPublic;
    players: PublicPlayer[];    // {id, username, isHost, ready, connected, status: 'active'|'spectator', revealedRole?: 'imposter'|'crew'}
    map?: MapSetupPublic;       // boundary, regions (+ section polygons), task points (lobby only), noGo, base
  };
  me: {
    id: string; username: string; isHost: boolean; ready: boolean;
    status: 'active' | 'spectator';
    personalScore: number;
    location?: { lat: number; lng: number; accuracy: number; quality: 'good' | 'weak' | 'stale'; oob: boolean };
    spawn?: { lat: number; lng: number; reached: boolean };
    tag?: string;               // after reveal
    role?: 'crew' | 'imposter'; // after reveal
    imposter?: {                // ONLY when role === 'imposter' and still active
      classes: ImposterClass[];
      allies: { playerId: string; username: string; tag: string; classes: ImposterClass[] }[];
      abilities: AbilityState[];   // {id, readyAt, activeUntil?, usesLeft?}
      infect: { readyAt: number; channel?: { endsAt: number; inRange: boolean } };
      compromisedIds: string[];    // exposed + infected + wrongly ejected
      exposures: { playerId: string; incubationEndsAt?: number }[];
      fakes: { id: string; lat: number; lng: number; assigned: boolean }[];
      camouflage?: { until: number; decoyTasks: TaskCard[] };
    };
  };
  game?: {
    phase: GamePhase; clock: { endsAt: number; pausedAt?: number };
    teamScore: number; targetScore: number;
    compromised: number; threshold: number; crewCount: number;   // infection boxes
    regionCounts: { regionId: string; bucket: '0' | '1' | '2–3' | '4+' }[];
    tasks: TaskCard[];            // crew own + partner slot; imposter: partner slot only
    taskLock?: { until: number }; // Task Stop
    meeting?: MeetingView;
    meetingsLeft: number;
    rerollReadyAt: number;
  };
  results?: ResultsView;          // only when ended
}
```
**`TaskCard`** reveals information in stages:
- ASSIGNED: `{id, stage:'assigned', kind, regionName, section, partnerTag?}`
- adds `{lat, lng}` at `pin`
- adds `{atPin: true}` when the player is within reach

The type and points arrive only in the `task:open` ack.

**Leak invariant:** for two crew players who differ only in infected status, `JSON.stringify(view)` must have the **same set of keys** (values may differ). Leak tests assert this.

### `AnonDot`
`{alias: string, lat, lng, flags: ('oob'|'stale'|'ally'|'exposed'|'infected')[]}`. The `ally`, `exposed` and `infected` flags are only ever sent to active imposters.

### `GameEvent` (examples)
`lobby.countdown`, `game.spawnStarted`, `game.rolesRevealed`, `task.revealed` (Stage 2), `task.atPin`, `task.completed {points}`, `task.fooled`, `task.expired`, `task.rerolled`, `sabotage.started {until}`, `meeting.called {by}`, `meeting.result {...}`, `player.ejected {username, wasImposter}`, `zone.warning`, `zone.penalty`, `game.paused`, `game.resumed`, `game.ended`.

Only public events go to everyone. Private events (`task.*`, own penalties) go only to their owner.
