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
- **Rate limits** (Phase 14; basic versions earlier): `loc:update` ≤ 2/s, other events ≤ 10/s per socket. Payloads are capped at 16 KB. Since Phase 1, every socket is limited to `socketEventsPerSecond` (10) events in any rolling second; extra events are dropped and acked with `RATE_LIMITED`.
- **IDs** are random, URL-safe, 12+ characters, and never sequential.

## Error codes
`INVALID_PAYLOAD`, `NOT_FOUND`, `LOBBY_FULL`, `GAME_IN_PROGRESS`, `NAME_TAKEN`, `NOT_HOST`, `NOT_ALLOWED`, `WRONG_PHASE`, `COOLDOWN`, `OUT_OF_RANGE`, `WEAK_GPS`, `STALE`, `OUT_OF_BOUNDS`, `TASKS_LOCKED`, `MEETING_ACTIVE`, `PAUSED`, `RATE_LIMITED`, `KICKED`, `INTERNAL`.

## Client → server
| Event | Payload | Ack data | Who / when | Phase |
|---|---|---|---|---|
| `time:ping` | `{clientTs}` | `{serverTs}` | anyone | 1 |
| `session:resume` | `{token}` | `{playerId, code}` | on (re)connect. Errors: `NOT_FOUND` (session or lobby gone), `KICKED` (token banned), `NOT_ALLOWED` (socket already bound to another player) | 1 |
| `lobby:create` | `{username, acceptedSafety: true}` | `{code, token, playerId}` | a socket not already in a lobby (`NOT_ALLOWED`) | 1 |
| `lobby:join` | `{code, username, acceptedSafety: true}` | `{token, playerId}` | lobby phase only. Errors: `NOT_FOUND`, `GAME_IN_PROGRESS`, `LOBBY_FULL`, `NAME_TAKEN` | 1 |
| `lobby:leave` | `{}` | — | any time; mid-game the player becomes a permanent disconnect | 1 |
| `lobby:setReady` | `{ready}` | — | lobby; `ready: true` needs a good fresh fix: `WEAK_GPS` (none or inaccurate) or `STALE` (old) | 1 |
| `lobby:updateConfig` | `{patch: Partial<GameConfigEditable>}` | — | host, lobby; un-readies everyone if any value changed. `testMode: true` → `NOT_ALLOWED` when the server forbids test mode | 1 |
| `lobby:kick` | `{playerId}` | — | host, lobby; not yourself (`NOT_ALLOWED`) | 1 |
| `loc:update` | `{lat, lng, accuracy, ts, heading?, speed?}`. `ts` is server-aligned epoch ms (the client adds its clock offset) | none (volatile emit, no ack); invalid, rate-limited or rejected fixes are dropped silently | bound player. Own limit `locEventsPerSecond` (2/s), separate from the 10/s | 2 |
| `lobby:setBoundary` | `{boundary: {type:'polygon', coords: [lng,lat][]} \| {type:'circle', center:{lat,lng}, radiusM}}` (polygon 3–500 points, radius ≤ 10 km) | `{areaM2}` | host, lobby. A rejected shape gets `INVALID_PAYLOAD` with a readable message (too small / too large / crosses itself). A changed boundary un-readies everyone and sends `lobby.mapChanged`; an identical one is a no-op | 2 |
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
| `dev:teleport` | `{lat, lng}` | — | **testMode only**. Stores a fix with `teleportAccuracyM`, bypassing the speed check. Used by the simulator's long-press and by bots | 2 |
| `dev:addBots` | `{count}` | — | **testMode only**, host | 4 |
| `dev:autoComplete` | `{taskId}` | — | **testMode only** | 5 |

`dev:*` events are rejected with `NOT_ALLOWED` unless the lobby's `testMode` is true. They are also rejected in production when the env var `ALLOW_TEST_MODE=false`.

## Server → client
| Event | Payload | Frequency | Phase |
|---|---|---|---|
| `view` | `PlayerView` (full snapshot for that player) | on change, throttled to `viewThrottleMs` (200 ms) | 1 |
| `radar` | `{dots: AnonDot[], at}`, per player, volatile | every `radarIntervalMs` (1 s) on the room tick, during lobby and play (lobby: every other connected, located player) | 2 |
| `event` | `GameEvent` (toast or overlay trigger) | as they happen | 1 |
| `kicked` | `{reason: 'replaced' \| 'kicked'}`; the server then disconnects the socket | once | 1 |

**Field formats (Phase 1, `schemas.ts`):** `username` is NFC-normalised, trimmed, runs of spaces collapsed, `[\p{L}\p{M}\p{N} _.-]`, 2–16 code points (ADR-034). `code` is trimmed and upper-cased, then 6 symbols from `lobbyCodeAlphabet`. `token` is 16–64 symbols and `playerId` 12–64 symbols of the URL-safe ID alphabet. All payload objects are strict (unknown keys → `INVALID_PAYLOAD`).

### `PlayerView` (outline; the full type is in `shared/src/types/view.ts`)
**Built so far (Phase 2):** `v`, `serverNow`, `lobby.{code, phase, hostId, testMode, config, map, players, countdownEndsAt?}` and `me.{id, username, isHost, ready, status, location?}`. `lobby.map` is `{boundary?: {ring: [lng,lat][] (closed), areaM2}}`; Phase 3 adds regions, points, no-go zones and the Base. `me.location` is the viewer's **own** fix only: `{lat, lng, accuracy, quality: 'good'|'weak'|'stale', oob}`; it is absent until the server accepts a fix. Quality and `oob` are derived when the view is built (ADR-040). `phase` is `'lobby' | 'starting'` (`starting` is a placeholder until Phase 4). `GameConfigPublic` = the host-editable keys (ADR-035). `countdownEndsAt` is present only while the start countdown runs. `PublicPlayer` has no `revealedRole` yet (Phase 8). `me.personalScore` and the other `me`/`game` fields arrive with their phases.

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
`{alias: string, lat, lng, flags: ('oob'|'stale'|'ally'|'exposed'|'infected')[]}`. The `ally`, `exposed` and `infected` flags are only ever sent to active imposters. The alias is per viewer, rotates every `dotAliasRotateS`, and dots are sorted by alias (ADR-041). A radar frame never contains a player id or username.

### `GameEvent` (examples)
Phase 1–2 events: `{type:'lobby.countdown', endsAt}`, `{type:'lobby.countdownCancelled'}`, `{type:'lobby.configChanged'}` and `{type:'lobby.mapChanged'}` (the last two: everyone was un-readied). All go to every connected player.

`lobby.countdown`, `game.spawnStarted`, `game.rolesRevealed`, `task.revealed` (Stage 2), `task.atPin`, `task.completed {points}`, `task.fooled`, `task.expired`, `task.rerolled`, `sabotage.started {until}`, `meeting.called {by}`, `meeting.result {...}`, `player.ejected {username, wasImposter}`, `zone.warning`, `zone.penalty`, `game.paused`, `game.resumed`, `game.ended`.

Only public events go to everyone. Private events (`task.*`, own penalties) go only to their owner.
