# Architecture

## 1. System overview
```
┌──────────────────── Phone (PWA, one per player) ────────────────────┐
│ React UI ── Zustand store ◀── socket client ──▶ (WSS, same origin)   │
│   │             ▲                 ▲                                  │
│   │       view / radar / event    │ loc:update (≤1 Hz), actions+ack  │
│ Leaflet map   useGeolocation ─────┘  (or GPS simulator in testMode)  │
│ Minigame UIs  useWakeLock · useServerClock · service worker          │
└──────────────────────────────────────────────────────────────────────┘
                                 │
┌──────────────── Node server (single process, Render) ───────────────┐
│ Express: GET /health, /version, static client build (prod)          │
│ Socket.IO gateway: zod validate → rate limit → RoomManager          │
│ RoomManager: Map<code, Room>                                         │
│ Room: state + 1 Hz ticker + command queue (serialised)               │
│   engine/ (PURE): reduce(state, cmd, now) / tick(state, now)         │
│   views/  (PURE): projectView(state, playerId) / radarFor(...)       │
│   emitter: diff views by hash → socket.emit('view', ...)             │
│ pino structured logs                                                 │
└──────────────────────────────────────────────────────────────────────┘
          packages/shared ← used by both (types, schemas, config, geo, rng, minigames)
```

## 2. Monorepo layout (created in Phase 0, grows by phase)
```
/
├─ CLAUDE.md  PROGRESS.md  README.md  docs/
├─ package.json            # root scripts: dev, build, test, lint, typecheck, verify, e2e, bots, tunnel
├─ pnpm-workspace.yaml     tsconfig.base.json  eslint.config.js  .prettierrc  .nvmrc  render.yaml (Phase 6)
├─ packages/shared/src/
│   ├─ config/   defaults.ts  schema.ts           # GameConfig inferred from zod ranges (ADR-032)
│   ├─ protocol/ events.ts  schemas.ts            # mirrors docs/PROTOCOL.md
│   ├─ types/    domain.ts  view.ts
│   ├─ geo/      distance.ts  boundary.ts  regions.ts  sections.ts  sampling.ts  index.ts
│   ├─ minigames/ index.ts  wires.ts  lock.ts  …  data/crosswords.ts
│   ├─ rules/    start.ts                         # startBlockers(): shared by engine and lobby checklist
│   ├─ rng.ts    tags.ts   ids.ts
├─ apps/server/src/
│   ├─ index.ts  app.ts  env.ts  logger.ts  version.ts
│   ├─ socket/   gateway.ts  handler.ts (validated())  context.ts  wiring.ts  types.ts  handlers/*.ts  rateLimit.ts
│   ├─ rooms/    RoomManager.ts  Room.ts  sessions.ts  ViewEmitter.ts  lobbyCode.ts
│   ├─ engine/   state.ts  reduce.ts  tick.ts  clock.ts
│   │            systems/ lobby.ts location.ts spawn.ts roles.ts tasks.ts infection.ts abilities.ts
│   │                     meetings.ts zone.ts victory.ts log.ts rematch.ts end.ts
│   └─ views/    projectView.ts  radar.ts  projectResults.ts
├─ apps/client/src/
│   ├─ main.tsx  App.tsx  styles/ (tokens.css, themes.css)
│   ├─ net/ socket.ts  clock.ts      store/ index.ts
│   ├─ hooks/ useGeolocation.ts useWakeLock.ts useServerNow.ts useHaptics.ts
│   ├─ sim/ GpsSimulator.tsx         # testMode
│   ├─ screens/ Home Join Lobby HostSetup Spawn RoleReveal Game Meeting Results Spectator HowToPlay
│   └─ components/ map/ hud/ minigames/ ui/
├─ apps/server/test/ # integration tests (socket.io-client vs in-process server)
├─ tools/bots/      # bot CLI (socket.io-client): join, ready, walk, do tasks, imposter behaviour
└─ e2e/             # Playwright specs (multi-context, testMode)
```

## 3. The engine (server, pure)
- `RoomState` is a plain serialisable object holding lobby, players, map, game, tasks, infection, abilities, meeting and an event log.
- **Commands** are validated socket messages turned into `{type, playerId, payload}`. `reduce(state, cmd, now) → {state, events}` checks every precondition: phase, role, range, cooldown, lock, meeting, pause.
- **Tick:** `tick(state, now)` runs every 1 s. It advances the spawn timeout, section-entry holds, AT_PIN detection, infection channels and incubation, cooldown expiry, the Task Stop lock, meeting stages, zone penalties, region counts (every 30 s), co-op expiry, forfeit timers and win checks.
- **Location updates** are commands. Range-sensitive checks (AT_PIN, channels) also run immediately on each accepted fix, so the game responds in under a second.
- **Serialisation:** each Room processes commands and ticks one at a time. `dispatch` and `tick` are synchronous (no awaits), so Node's single thread is the queue (ADR-037). The order is strict, which makes win precedence deterministic.
- **Clock:** `GameClock` (`engine/clock.ts`, plain data with a set of pause reasons, ADR-053) tracks *game time*: real time minus paused time (meetings and host pauses). Match end, cooldowns, incubation, co-op expiry and lock time are stored as game-time deadlines. Meeting stages and the spawn timeout use real (server) time; a host pause during a meeting pushes the stage deadline back on resume (ADR-074). Views convert game-time deadlines into absolute server times for display, and send `pausedAt` while paused.
- **RNG:** each Room has a seeded `Rng` (mulberry32) created from `crypto.randomUUID()`. The seed is logged, so tests can inject it.
- **Purity:** engine and view code does **not** use `Date.now()`, `Math.random()` or I/O. Tests drive it with a fake clock.

## 4. Views and leak prevention
- `projectView(state, playerId)` builds every field explicitly from an allow-list ([ROLES.md visibility matrix](ROLES.md#visibility-matrix)). No spreading of server objects.
- After each command or tick, the Room recomputes views for every connected player. The emitter hashes each one and sends only the views that changed, at most once per `viewThrottleMs`.
- `radarFor(state, viewerId)` builds dots according to `playerVisibility`, with per-viewer rotating aliases and role-filtered flags.
- **Leak tests** (in [TESTING.md](TESTING.md#3-leak-tests-mandatory-from-phase-1)) are mandatory from Phase 1 on.

## 5. Location pipeline
1. **Client:** `navigator.geolocation.watchPosition({enableHighAccuracy: true, maximumAge: 0, timeout: 10000})`. Sends every `locationSendIntervalMs` (1 s) while moving, and every `stationarySendIntervalMs` (5 s) once the player has moved under `locationMinMoveM` (3 m) over `stationaryWindowS` (10 s). The lobby drops to low-accuracy GPS once the player is ready (ADR-100). In testMode the GPS simulator replaces this source.
2. **Server:**
   - validate the schema
   - reject fixes from the future (>5 s ahead)
   - reject a fix if the speed since the last accepted fix is over `maxSpeedMps` (with the 3-fix re-anchor)
   - store `{lat, lng, accuracy, ts, receivedAt}`
   - derive `quality`: good if accuracy ≤ 30 m and fresh; weak if accuracy > 30 m; stale if older than 10 s
3. **Game rules use only good fixes:** reveals, reach, channels, gathering and zone checks.
4. **Privacy:** raw positions stay in memory for the length of the match and are deleted when the lobby is deleted. They are never written to disk or logged; logs record only region-level events.

## 6. Reconnect and sessions
- Joining returns a `token` (22 URL-safe symbols, ≈132 bits). Tokens live only in the server's `SessionRegistry` and the client's `localStorage`, never in `RoomState` or views (ADR-037). The client stores `{token, code}` in `localStorage`.
- On connect, the client sends `session:resume`. The server re-binds the socket to the player and sends a fresh view.
- A player's socket may change; their `playerId` and the game state stay the same. Duplicate tabs: the newest socket wins and the older one gets `kicked {reason:'replaced'}` and is disconnected; the client offers "Use here instead".
- `session:resume` errors: `NOT_FOUND` (session or lobby gone; the client clears it) and `KICKED` (token banned for that lobby).

## 7. Client architecture
- **State:** one Zustand store holding `view`, `radar`, the server clock offset, connection status and local UI state. Server data is never mutated optimistically, except for minigame UI state.
- **Screen routing** is derived from `view.lobby.phase` and `view.me`, with no URL router; only `?code=` is read on load:
  - Home → Lobby (+HostSetup) → Spawn → RoleReveal → Game (HUD + Map + sheets) ↔ Meeting → Results
- **Theming:** `<html data-theme="crew|imposter|neutral">` driven by CSS variables. Camouflage sets `crew` on the imposter's own device; meetings set `neutral`.
- **Map:** react-leaflet with custom layers. Keep the dot layer cheap (≤ 12 markers; positions animated with CSS transforms).

## 8. PWA
vite-plugin-pwa (Workbox):
- precache the app shell
- runtime-cache map tiles (CacheFirst, max ~500 tiles, 7 days)
- `registerType: 'prompt'` with an in-app "Update available" toast

Manifest: name "AfterDark", standalone, portrait, dark theme colour, maskable icons. iOS: apple-touch-icon and status-bar meta tags, plus Add-to-Home-Screen instructions. Wake Lock is re-acquired on `visibilitychange`.

## 9. Deployment (Phase 6)
- **Render web service:** `pnpm install --frozen-lockfile && pnpm build`, then `node apps/server/dist/index.js`. The server serves `apps/client/dist` and Socket.IO on the same port.
- **Health check:** `/health`. `/version` returns the git SHA.
- **Env:** `PORT`, `NODE_ENV`, `LOG_LEVEL`, `ALLOW_TEST_MODE`, `PUBLIC_URL`.
- **Blueprint:** `render.yaml` (free plan, region `singapore`, `autoDeployTrigger: commit`, Node from `.nvmrc`, pnpm via `corepack enable`). The server serves `apps/client/dist` only when `NODE_ENV=production`. Helmet CSP, compression and cache rules live in `apps/server/src/web.ts`; the WebSocket accepts only a same-origin `Origin`. On SIGTERM the server sends `server:shutdown`, waits `shutdownNoticeMs`, then closes (ADR-065, ADR-066).
- **Single instance**, because state is in memory. Scaling out would need sticky sessions plus shared state, which is out of scope.

## 10. Security model (summary)
- **Threats:** reading hidden information from the network, spoofing task completion, GPS spoofing, flooding, host abuse, XSS through usernames.
- **Mitigations:**
  - allow-list views
  - server-verified minigames
  - speed and accuracy checks
  - zod on every input
  - rate and size limits
  - the host has no hidden-information powers
  - React escaping, plus usernames NFC-normalised and limited to `[\p{L}\p{M}\p{N} _.-]` (ADR-034)
  - helmet headers
  - CORS limited to the app's own origin
- The anti-cheat table is in [RULES.md](RULES.md) and the INFILTR8 notes.

## 11. Performance budgets
- Initial JS ≤ 300 KB gzipped (Leaflet included, map tiles excluded). Minigames are lazy-loaded.
- Position-to-screen latency ≤ 1.5 s at the 95th percentile. A server tick for 12 players takes < 5 ms.
- Battery: location sends drop to every 5 s when stationary. The wake lock is only held during an active lobby or game.
