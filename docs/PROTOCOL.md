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
| `task:open` | `{taskId}` | `{type, points, puzzle}` (`type` is `wires` or `lock` for now; never the solution) | crew, in the zone, stage `pin`, a good fix within `reachRadiusM`. Re-opening an open task returns the same puzzle. Errors: `NOT_ALLOWED` (imposter, not revealed, another task open), `NOT_FOUND`, `WEAK_GPS`, `STALE`, `OUT_OF_RANGE`, `TASKS_LOCKED`, `WRONG_PHASE`, `PAUSED` | 5 |
| `task:action` | `{taskId, action}` (body ≤ 2 KB, parsed by the game's schema) | `{feedback}` (lock: `{exact, misplaced, guessesLeft, solved, rerolled}`) | multi-step games, task open. `INVALID_PAYLOAD` for a bad move or a game without actions | 5 |
| `task:submit` | `{taskId, answer}` (body ≤ 2 KB) | `{result: 'success' \| 'wrong' \| 'fooled', points}`; a wrong answer is a normal result and locks submitting for `taskWrongLockoutS` (`COOLDOWN` meanwhile) | task open. `INVALID_PAYLOAD` for a malformed answer, `NOT_ALLOWED` if nothing is open | 5 |
| `task:cancel` | `{taskId}` | — | closes the minigame; the task stays where it was | 5 |
| `task:reroll` | `{taskId}` | — | any stage; per-player cooldown `rerollCooldownS` (180 s of game time), `COOLDOWN` before it | 5 |
| `task:reportUnsafe` | `{taskId, reason?}` (reason ≤ 100 chars, ignored) | — | no cooldown. The point is disabled for the game and every task on it is replaced (others get `task.removed`) | 5 |
| `ability:infect` | `{}` | `{channelEndsAt}` (server epoch ms) | active imposter, `playing`. The server picks the **nearest** eligible target within `infectionRadiusM` and starts the channel. Errors: `WRONG_PHASE`, `NOT_ALLOWED` (not an active imposter, or a channel is already running), `WEAK_GPS` / `STALE` (the imposter's own fix), `OUT_OF_BOUNDS`, `COOLDOWN`, `OUT_OF_RANGE` (no eligible target: also the answer when the only one nearby is another imposter, an exposed or infected player, or someone with a weak or stale fix), `PAUSED`. `MEETING_ACTIVE` while a meeting runs | 7 |
| `ability:cancelInfect` | `{}` | — | stops a running channel; free (no cooldown). A no-op when none is running | 7 |
| `meeting:call` | `{}` | — | active player, `playing`. Errors: `WRONG_PHASE`, `NOT_ALLOWED` (spectator, meetings off, allowance used), `MEETING_ACTIVE`, `PAUSED`, `COOLDOWN` (start grace or the post-meeting cooldown), `STALE` | 8 |
| `meeting:skipDiscussion` | `{}` | — | active player, during Discuss (idempotent). `WRONG_PHASE` otherwise, `NOT_ALLOWED` for a spectator | 8 |
| `meeting:vote` | `{target: playerId \| 'skip'}` | — | active player, during Vote, once. `NOT_ALLOWED` (locked, or a spectator), `NOT_FOUND` (not an active player), `WRONG_PHASE` | 8 |
| `ability:taskStop` | `{}` | `{lockEndsAt}` (server epoch ms) | active imposter holding Task Stop (Saboteur, or any in `all` mode), `playing`. Errors: `WRONG_PHASE`, `NOT_ALLOWED` (not an imposter, no such ability, or a lock is already running: E12), `MEETING_ACTIVE`, `PAUSED`, `WEAK_GPS` / `STALE`, `OUT_OF_BOUNDS`, `COOLDOWN` (the initial cooldown, the recharge, or the post-meeting grace). A refusal costs no cooldown | 9 |
| `ability:fakeTask` | `{lat, lng}` | `{fakeId}` (the id the fake carries as a task) | active imposter holding Fake Task (Phantom, or any in `all` mode), `playing`. The same errors as Task Stop, plus `OUT_OF_BOUNDS` (outside the area or in a no-go zone) and `NOT_ALLOWED` (already `fakeTaskMaxActive` fakes out: E14; too close to a task point or another fake: E13; ADR-078). A refusal costs no cooldown | 9 |
| `ability:camouflage` | `{}` | `{endsAt}` | Camouflage | 10 |
| `coop:start` | `{taskId}` | — | at pin; opens a waiting session | 10 |
| `coop:join` | `{taskId}` | `{puzzle}` | assigned partner, or a camouflaged imposter at a waiting session | 10 |
| `coop:submit` | `{taskId, answer}` | `{result}` | | 10 |
| `lobby:playAgain` | `{}` | — | host, ended | 12 |
| `dev:teleport` | `{lat, lng}` | — | **testMode only**. Stores a fix with `teleportAccuracyM`, bypassing the speed check. Used by the simulator's long-press and by bots | 2 |
| `dev:addBots` | `{count: 1..11, imposterBehaviour?: 'wander' \| 'chase' \| 'sabotage'}` | — | **testMode only**, host, lobby phase. `imposterBehaviour` applies to every imposter bot in the room (default `wander`: they walk and never infect; `chase`: they hunt, see ADR-069). Errors: `NOT_ALLOWED` (test mode off), `NOT_HOST`, `WRONG_PHASE`, `LOBBY_FULL` (it would pass `maxPlayers`; nothing is added). In-process bots named `bot-N` join, send fixes and ready up on the room tick | 4 |
| `dev:advanceClock` | `{seconds: 1..600}` | — | **testMode only**, host, `playing`. Moves game time forward, so every game-time deadline (cooldowns, channels, incubation, the match end) gets closer by that much. `PAUSED` while the clock is stopped (ADR-070) | 7 |
| `dev:autoComplete` | `{taskId}` | — | **testMode only**; the task must be open. Finishes it as if solved | 5 |
| `dev:setMinigames` | `{types: SoloMinigameType[]}` (1–7) | — | **testMode only**, host, lobby phase. Limits which minigames new tasks can be; types with no game yet are dropped (`INVALID_PAYLOAD` if none is left) | 5 |

`dev:*` events are rejected with `NOT_ALLOWED` unless the lobby's `testMode` is true. They are also rejected in production when the env var `ALLOW_TEST_MODE=false`.

## Server → client
| Event | Payload | Frequency | Phase |
|---|---|---|---|
| `view` | `PlayerView` (full snapshot for that player) | on change, throttled to `viewThrottleMs` (200 ms) | 1 |
| `radar` | `{dots: AnonDot[], at}`, per player, volatile | every `radarIntervalMs` (1 s) on the room tick, during lobby and play (lobby: every other connected, located player) | 2 |
| `event` | `GameEvent` (toast or overlay trigger) | as they happen | 1 |
| `kicked` | `{reason: 'replaced' \| 'kicked'}`; the server then disconnects the socket | once | 1 |
| `server:shutdown` | `{reason: 'restart'}`; sent to every connected client on SIGTERM (a deploy), `shutdownNoticeMs` before the server closes. Clients show a toast and let Socket.IO reconnect; the game state lives in memory, so a restart ends running lobbies | once (Phase 6) | 6 |

**Imposter block (Phase 7).** `me.imposter` now also carries `infect: {readyAt, channel?: {endsAt, inRange}}` (`readyAt` is a constant server-epoch deadline: in the past when Infect is ready; it moves only when the imposter is out of bounds, because the cooldown stops, RULES §9.3), `compromisedIds` (every exposed **and** infected player, whichever imposter caused it) and `exposures: {playerId, incubationEndsAt?}[]` (the exposed subset; `incubationEndsAt` is absent until the exposing imposter has been away for `incubationDepartS`). A `channel` exists only in the view of the imposter who runs it. `abilities`, `fakes` and `camouflage` arrive with Phases 9–10. A crew view, whatever the player's infection status, has none of these keys and is byte-identical for healthy, exposed and infected players apart from the public `game.compromised`.

**Abilities block (Phase 9).** `me.imposter.abilities` lists the class abilities this build has for the imposter's classes (Task Stop for a Saboteur, Fake Task for a Phantom, both in `all` mode; a Camouflage-class imposter has none until Phase 10). `readyAt` is a game-time deadline as a constant server-epoch value (in the past when ready; it moves only while the imposter is out of bounds or when a meeting adds the grace). `me.imposter.fakes` is the Phantom's own list: `{id, lat, lng, assigned}`, where `assigned` flips from `false` (queued) to `true` when a crew slot takes it; it is `[]` for any imposter without Fake Task and the key does not exist for anyone else. Each ally entry carries that ally's `abilities` (cooldowns are imposter-visible, ROLES.md). `game.taskLock?: {until}` is **public**: present while a Task Stop lock runs, identical for every viewer, and gone from the first view after it ends. A fake's task card has exactly the keys of a real one, its id has the same format, and its `task:open` ack has the same shape: only the `task:submit` result (`fooled`, 0 points) differs.

**Radar visibility (Phase 3, ADR-047):** `playerVisibility` decides who appears in a viewer's `radar` frame: `nearby` (within `nearbyRadiusM` of the viewer's own fix), `regions` (no dots) or `all`. Dot flags are `oob` (boundary or no-go zone), `stale`, and, only for an active imposter viewing another imposter, `ally`; `exposed` and `infected` (Phase 7) mark exposed and infected crew, again only for an active imposter viewer.

**Field formats (Phase 1, `schemas.ts`):** `username` is NFC-normalised, trimmed, runs of spaces collapsed, `[\p{L}\p{M}\p{N} _.-]`, 2–16 code points (ADR-034). `code` is trimmed and upper-cased, then 6 symbols from `lobbyCodeAlphabet`. `token` is 16–64 symbols and `playerId` 12–64 symbols of the URL-safe ID alphabet. All payload objects are strict (unknown keys → `INVALID_PAYLOAD`).

### `PlayerView` (outline; the full type is in `shared/src/types/view.ts`)
**Phase 4 adds** (details after this paragraph): `lobby.phase` is now `'lobby' | 'spawning' | 'reveal' | 'playing' | 'ended'` (`starting` is gone); `me.spawn?`, `me.tag?`, `me.role?`, `me.imposter?: {classes, allies}` (imposters only; a crew view has no `imposter` key), `me.personalScore?`, `me.zone?: {oob, graceEndsAt?}` and `game.{spawn?, revealEndsAt?, clock?, teamScore?, targetScore?, compromised?, threshold?, crewCount?, meetingsLeft?, result?}`, each present in the phases listed in `types/view.ts`. `me.location.oob` now also counts no-go zones. **Built through Phase 3:** `v`, `serverNow`, `lobby.{code, phase, hostId, testMode, config, map, players, countdownEndsAt?}`, `me.{id, username, isHost, ready, status, location?}` and `game?.{regionCounts}`. `lobby.map` is `{boundary?: {ring: [lng,lat][] (closed), areaM2}, regions: RegionPublic[], taskPoints: TaskPointPublic[], noGo: ring[], base?: {lat,lng}}`. A `RegionPublic` is `{id, name, area: [lng,lat] multi-polygon, origin: {lat,lng}, rhoM, areaM2, sections: {id: 'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW'|'C', areaM2, usable}[]}`: the 9 section polygons are not sent, clients derive them with `sectionShapes()` (ADR-044). A `TaskPointPublic` is `{id, lat, lng, regionId, section, source: 'auto'|'host'}` and is present **only while `lobby.phase === 'lobby'`** (empty afterwards: the pool is secret during play). Setup is identical for every viewer. `game.regionCounts` is `{regionId, bucket}[]` with bucket labels from `regionCountBuckets`, present once the lobby has regions, refreshed every `regionCountRefreshS`, with the viewer's own region live (ADR-046). `me.location` is the viewer's **own** fix only: `{lat, lng, accuracy, quality: 'good'|'weak'|'stale', oob}`; it is absent until the server accepts a fix. Quality and `oob` are derived when the view is built (ADR-040). `phase` is `'lobby' | 'starting'` (`starting` is a placeholder until Phase 4). `GameConfigPublic` = the host-editable keys (ADR-035). `countdownEndsAt` is present only while the start countdown runs. `me.personalScore` and the other `me`/`game` fields arrive with their phases.

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
      allies: { playerId: string; username: string; tag: string; classes: ImposterClass[]; abilities: AbilityState[] }[];
      abilities: AbilityState[];   // {id: 'taskStop'|'fakeTask'|'camouflage', readyAt, activeUntil?}; readyAt is a constant server-epoch deadline
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

**Phase 5 view fields:** while `playing`, every viewer with a role gets `game.tasks: TaskCard[]` (their own cards; `[]` for an imposter) and, only while a reroll cooldown runs, `game.rerollReadyAt` (server epoch ms, crew only; omitted while the clock is stopped). A card is `{id, stage:'assigned', kind, regionId, regionName, section}` or, once revealed, `{id, stage:'pin', kind, regionId, regionName, section, lat, lng, atPin}` (`partnerTag` arrives with Phase 10). `regionId` is public (regions are) and lets the client highlight the section. `kind` is `'solo'` for now. Fake and real cards are identical. The `task:open` ack is `{type, points, puzzle}` where `points` is the config value of `type` for real **and** fake tasks.

**Leak invariant:** for two crew players who differ only in infected status, `JSON.stringify(view)` must have the **same set of keys** (values may differ). Leak tests assert this.

### `AnonDot`
`{alias: string, lat, lng, flags: ('oob'|'stale'|'ally'|'exposed'|'infected')[]}`. The `ally`, `exposed` and `infected` flags are only ever sent to active imposters. The alias is per viewer, rotates every `dotAliasRotateS`, and dots are sorted by alias (ADR-041). A radar frame never contains a player id or username.

### `GameEvent` (examples)
Phase 1–3 events: `{type:'lobby.countdown', endsAt}`, `{type:'lobby.countdownCancelled'}`, `{type:'lobby.configChanged'}` and `{type:'lobby.mapChanged'}` (the last two: everyone was un-readied; `mapChanged` now covers the boundary, regions, points, no-go zones and the Base). All go to every connected player.

Phase 5 events (all private to the player concerned): `task.revealed` (Stage 2), `task.atPin`, `task.completed {points}`, `task.reset {reason: 'range'|'gps'|'zone'|'connection'|'meeting'|'sabotage'}` (an open minigame was dropped) and `task.removed {reason:'unsafe'}` (a task was swapped because its point was reported). `task.fooled` and `task.expired` arrive with Phases 9–10 (a fake's `fooled` already travels in the submit ack).

Phase 9 events: `sabotage.started {until}` (**public**, server epoch ms; every phone shows SYSTEMS JAMMED; it never says who), and `task.reset` gains `reason: 'sabotage'` (private to every crew member whose minigame was open). There is no event for a fake: it appears as an ordinary new card.

Phase 7 events: `game.compromised {count}` (**public**: a crew member just became infected; the count only, never who), `infect.completed` (private to the imposter whose channel finished) and `infect.failed {reason: 'range'|'target'|'meeting'}` (private to the imposter, no cooldown: `range` = a gap beyond `infectionGapToleranceS`, `target` = the target stopped being eligible, E6/E7; `meeting` = a meeting was called). **The target is never sent anything**: no event, no view change, no vibration (RULES §7.1.6).

Phase 4 events: `lobby.startFailed {reason:'spawns'}` (all; the countdown ended but the area is too small to spread everyone out, E3), `game.spawnStarted`, `game.rolesRevealed`, `game.playStarted`, `game.paused`, `game.resumed`, `game.ended {winner, reason}` (all; `winner` is `'crew'|'imposters'|'draw'|null`, `reason` is `score|ejection|infection|time|forfeit|abort`), `zone.warning` and `zone.penalty {points}` (private to the player out of bounds).

Phase 8 (meetings): `meeting.called {by}` (**public**, `by` is the caller's username: the alarm), `meeting.result {ejected?: {username, wasImposter}}` (**public**, sent when Result begins; no `ejected` means nobody was ejected), and `task.reset` gains `reason: 'meeting'`. Views: `game.meeting?: MeetingView` while a meeting runs, `lobby.players[].revealedRole` once a player is ejected, `me.status: 'spectator'` for an ejected player, and `game.meetingsLeft` is now the **viewer's own** remaining meetings (0 for a spectator). `MeetingView` is `{stage: 'gather'|'discuss'|'vote'|'result', endsAt (server epoch ms; with `pausedAt` the remaining time is `endsAt − pausedAt`), pausedAt?, calledBy (username), gathered: playerId[], roster: {playerId, username, status, connected}[], progress: {done, total} (arrived / skipped / voted, counts only), myVote? (the viewer's own), tallies?: {target: playerId|'skip', count}[] and outcome?: {ejectedId?, ejectedUsername?, wasImposter?} (result only)}`. It has the same shape for crew, imposters and spectators. **No view or event ever says who voted for whom.** `dev:addBots` takes `meetings?: 'off'|'random'` (`pnpm bots --meetings random`): bots always join and vote in meetings, and with `random` each also calls one at a random time (`botMeetingMinS`–`botMeetingMaxS`).

All events: `lobby.countdown`, `game.spawnStarted`, `game.rolesRevealed`, `task.revealed` (Stage 2), `task.atPin`, `task.completed {points}`, `task.fooled`, `task.expired`, `task.rerolled`, `sabotage.started {until}`, `meeting.called {by}`, `meeting.result {ejected?}`, `zone.warning`, `zone.penalty`, `game.paused`, `game.resumed`, `game.ended`.

Only public events go to everyone. Private events (`task.*`, own penalties) go only to their owner.
