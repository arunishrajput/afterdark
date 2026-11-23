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
| `lobby:regenerateRegions` | `{regionCount?: 'auto' \| 2..6, seed?: uint32}` | — | host, lobby, boundary set (`INVALID_PAYLOAD` otherwise). A `regionCount` is stored in `config.regionCount`. Builds a new layout (names reset, auto points regenerated, host points and Base kept if still valid) and un-readies everyone | 3 |
| `lobby:renameRegion` | `{regionId, name}` (name: NFC, trimmed, spaces collapsed, 1–`regionNameMaxLen` (20) of letters, digits, space, `_ . ' -`) | — | host, lobby. `NOT_FOUND` for an unknown region; an unchanged name is a no-op | 3 |
| `lobby:editTaskPoints` | `{add?: {lat,lng}[] (≤ 20), remove?: string[] (≤ 200), regenerate?: boolean}` | — | host, lobby. Order: remove, regenerate (keeps host points), add. The server computes each added point's region and section and rejects the whole call (`INVALID_PAYLOAD`) if any is outside the boundary or inside a no-go zone, or the pool would pass 400. Unknown ids to remove are ignored. No change → nobody is un-readied | 3 |
| `lobby:setNoGoZones` | `{zones: [lng,lat][][]}` (≤ 20 zones of 3–200 corners; the list replaces the old one) | — | host, lobby. A zone that is too small or crosses itself → `INVALID_PAYLOAD` with a readable message. Removes pool points inside zones, rebuilds regions (same seed, names kept), moves the default Base out of a zone. An identical list is a no-op | 3 |
| `lobby:setBase` | `{lat, lng}` | — | host, lobby. Must be inside the boundary and outside no-go zones (`INVALID_PAYLOAD`). Marks the Base as host-placed | 3 |
| `game:forceStart` | `{}` | — | host, `spawning` only (`NOT_HOST`, `WRONG_PHASE`): roles are assigned now even if some players have not reached their spawn | 4 |
| `game:pause` / `game:resume` | `{}` | — | host, `playing` only. While paused every other command except `loc:update`, `dev:teleport`, `lobby:leave`, connecting and the host's own pause/resume/abort is rejected with `PAUSED`. Pausing twice or resuming when not paused is a no-op | 4 |
| `game:abort` | `{}` | — | host, `spawning`, `reveal` or `playing` (`WRONG_PHASE` in the lobby or after the end). Ends the game with no winner | 4 |
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
| `dev:addBots` | `{count: 1..11}` | — | **testMode only**, host, lobby phase. Errors: `NOT_ALLOWED` (test mode off), `NOT_HOST`, `WRONG_PHASE`, `LOBBY_FULL` (it would pass `maxPlayers`; nothing is added). In-process bots named `bot-N` join, send fixes and ready up on the room tick | 4 |
| `dev:autoComplete` | `{taskId}` | — | **testMode only** | 5 |

`dev:*` events are rejected with `NOT_ALLOWED` unless the lobby's `testMode` is true. They are also rejected in production when the env var `ALLOW_TEST_MODE=false`.

## Server → client
| Event | Payload | Frequency | Phase |
|---|---|---|---|
| `view` | `PlayerView` (full snapshot for that player) | on change, throttled to `viewThrottleMs` (200 ms) | 1 |
| `radar` | `{dots: AnonDot[], at}`, per player, volatile | every `radarIntervalMs` (1 s) on the room tick, during lobby and play (lobby: every other connected, located player) | 2 |
| `event` | `GameEvent` (toast or overlay trigger) | as they happen | 1 |
| `kicked` | `{reason: 'replaced' \| 'kicked'}`; the server then disconnects the socket | once | 1 |

**Radar visibility (Phase 3, ADR-047):** `playerVisibility` decides who appears in a viewer's `radar` frame: `nearby` (within `nearbyRadiusM` of the viewer's own fix), `regions` (no dots) or `all`. Dot flags are `oob` (boundary or no-go zone), `stale`, and, only for an active imposter viewing another imposter, `ally`; `exposed` and `infected` arrive in Phase 7.

**Field formats (Phase 1, `schemas.ts`):** `username` is NFC-normalised, trimmed, runs of spaces collapsed, `[\p{L}\p{M}\p{N} _.-]`, 2–16 code points (ADR-034). `code` is trimmed and upper-cased, then 6 symbols from `lobbyCodeAlphabet`. `token` is 16–64 symbols and `playerId` 12–64 symbols of the URL-safe ID alphabet. All payload objects are strict (unknown keys → `INVALID_PAYLOAD`).

### `PlayerView` (outline; the full type is in `shared/src/types/view.ts`)
**Phase 4 adds** (details after this paragraph): `lobby.phase` is now `'lobby' | 'spawning' | 'reveal' | 'playing' | 'ended'` (`starting` is gone); `me.spawn?`, `me.tag?`, `me.role?`, `me.imposter?: {classes, allies}` (imposters only; a crew view has no `imposter` key), `me.personalScore?`, `me.zone?: {oob, graceEndsAt?}` and `game.{spawn?, revealEndsAt?, clock?, teamScore?, targetScore?, compromised?, threshold?, crewCount?, meetingsLeft?, result?}`, each present in the phases listed in `types/view.ts`. `me.location.oob` now also counts no-go zones. **Built through Phase 3:** `v`, `serverNow`, `lobby.{code, phase, hostId, testMode, config, map, players, countdownEndsAt?}`, `me.{id, username, isHost, ready, status, location?}` and `game?.{regionCounts}`. `lobby.map` is `{boundary?: {ring: [lng,lat][] (closed), areaM2}, regions: RegionPublic[], taskPoints: TaskPointPublic[], noGo: ring[], base?: {lat,lng}}`. A `RegionPublic` is `{id, name, area: [lng,lat] multi-polygon, origin: {lat,lng}, rhoM, areaM2, sections: {id: 'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW'|'C', areaM2, usable}[]}`: the 9 section polygons are not sent, clients derive them with `sectionShapes()` (ADR-044). A `TaskPointPublic` is `{id, lat, lng, regionId, section, source: 'auto'|'host'}` and is present **only while `lobby.phase === 'lobby'`** (empty afterwards: the pool is secret during play). Setup is identical for every viewer. `game.regionCounts` is `{regionId, bucket}[]` with bucket labels from `regionCountBuckets`, present once the lobby has regions, refreshed every `regionCountRefreshS`, with the viewer's own region live (ADR-046). `me.location` is the viewer's **own** fix only: `{lat, lng, accuracy, quality: 'good'|'weak'|'stale', oob}`; it is absent until the server accepts a fix. Quality and `oob` are derived when the view is built (ADR-040). `phase` is `'lobby' | 'starting'` (`starting` is a placeholder until Phase 4). `GameConfigPublic` = the host-editable keys (ADR-035). `countdownEndsAt` is present only while the start countdown runs. `PublicPlayer` has no `revealedRole` yet (Phase 8). `me.personalScore` and the other `me`/`game` fields arrive with their phases.

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
Phase 1–3 events: `{type:'lobby.countdown', endsAt}`, `{type:'lobby.countdownCancelled'}`, `{type:'lobby.configChanged'}` and `{type:'lobby.mapChanged'}` (the last two: everyone was un-readied; `mapChanged` now covers the boundary, regions, points, no-go zones and the Base). All go to every connected player.

Phase 4 events: `lobby.startFailed {reason:'spawns'}` (all; the countdown ended but the area is too small to spread everyone out, E3), `game.spawnStarted`, `game.rolesRevealed`, `game.playStarted`, `game.paused`, `game.resumed`, `game.ended {winner, reason}` (all; `winner` is `'crew'|'imposters'|'draw'|null`, `reason` is `score|ejection|infection|time|forfeit|abort`), `zone.warning` and `zone.penalty {points}` (private to the player out of bounds).

All events: `lobby.countdown`, `game.spawnStarted`, `game.rolesRevealed`, `task.revealed` (Stage 2), `task.atPin`, `task.completed {points}`, `task.fooled`, `task.expired`, `task.rerolled`, `sabotage.started {until}`, `meeting.called {by}`, `meeting.result {...}`, `player.ejected {username, wasImposter}`, `zone.warning`, `zone.penalty`, `game.paused`, `game.resumed`, `game.ended`.

Only public events go to everyone. Private events (`task.*`, own penalties) go only to their owner.
