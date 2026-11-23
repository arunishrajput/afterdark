# AfterDark: Progress Tracker

> **Every session starts here.** Claude reads this file first (see CLAUDE.md → session protocol) and updates it before ending.
> Status legend: `☐ NOT STARTED` · `▶ NEXT` · `◐ IN PROGRESS` · `✅ DONE` · `⏸ BLOCKED`

## Current status
**▶ NEXT: Phase 03, Regions, sections & task points** → [docs/phases/PHASE-03-regions-task-points.md](docs/phases/PHASE-03-regions-task-points.md)

**Live URL:** _not deployed yet (Phase 06)_

## Phase table
| # | Phase | Status | Date | Tag / notes |
|---|---|---|---|---|
| 00 | [Setup & scaffolding](docs/phases/PHASE-00-setup.md) | ✅ DONE | 2026-11-23 | `phase-00-done` |
| 01 | [Lobby system](docs/phases/PHASE-01-lobby.md) | ✅ DONE | 2026-11-23 | `phase-01-done` |
| 02 | [Map, location & boundary](docs/phases/PHASE-02-map-location-boundary.md) | ✅ DONE | 2026-11-23 | `phase-02-done` |
| 03 | [Regions, sections & task points](docs/phases/PHASE-03-regions-task-points.md) | ▶ NEXT | | |
| 04 | [Game start flow](docs/phases/PHASE-04-game-start.md) | ☐ NOT STARTED | | |
| 05 | [Task engine & first minigames](docs/phases/PHASE-05-tasks-core.md) | ☐ NOT STARTED | | |
| 06 | [Deploy & first field test](docs/phases/PHASE-06-deploy-field-test.md) | ☐ NOT STARTED | | |
| 07 | [Infection system](docs/phases/PHASE-07-infection.md) | ☐ NOT STARTED | | |
| 08 | [Meetings & voting](docs/phases/PHASE-08-meetings-voting.md) | ☐ NOT STARTED | | |
| 09 | [Abilities: Saboteur & Phantom](docs/phases/PHASE-09-abilities-saboteur-phantom.md) | ☐ NOT STARTED | | |
| 10 | [Co-op tasks & Camouflage](docs/phases/PHASE-10-coop-camouflage.md) | ☐ NOT STARTED | | |
| 11 | [Remaining minigames & balance](docs/phases/PHASE-11-minigames-balance.md) | ☐ NOT STARTED | | |
| 12 | [Results & replay](docs/phases/PHASE-12-results-replay.md) | ☐ NOT STARTED | | |
| 13 | [PWA & mobile polish](docs/phases/PHASE-13-pwa-polish.md) | ☐ NOT STARTED | | |
| 14 | [Hardening & demo](docs/phases/PHASE-14-hardening-demo.md) | ☐ NOT STARTED | | |

## Handoff notes for the next session
_From Phase 02 (2026-11-23):_
- **Map tiles are OSM, not CARTO** (ADR-039): CARTO now serves an "API KEY REQUIRED" placeholder. `.dark-tiles` in `styles/index.css` darkens them. Phase 6 CSP and Phase 13 tile cache must use `tile.openstreetmap.org`.
- **Geoman gotchas** (`components/map/BoundaryEditor.tsx`): it is opt-in (`L.PM.setOptIn(true)`), so the `MapContainer` needs `pmIgnore={false}` or `map.pm` is undefined, and any layer you want editable needs `pmIgnore: false`. Wrap the map frame in `isolate` (Leaflet panes go up to z-index 1000 and otherwise paint over the Ready bar).
- **New engine pieces:** `engine/systems/location.ts` (`locUpdate`, `teleport`, `fixQuality`, `requireGoodFix`), `systems/map.ts` (`setBoundary`; Phase 3 adds regions, points, no-go zones and the Base here), `systems/players.ts` (`findPlayer`). Quality is **derived**: `projectView(state, id, now)` and `buildRadar(state, viewerId, now)` take `now`. `RoomState` now has `boundary?` and `radarSalt` (required by `createRoomState`; `RoomManager` supplies it). `PlayerState` has `loc?` and `locPending?`.
- **Start blockers:** `startBlockers(config, {playerCount, readyCount, boundarySet})`. Phase 3 adds Base and task-point blockers to the same function and to `Checklist.tsx`. Existing tests use helpers that draw a boundary and give every player a fix (`lobbyWith` in `lobby.test.ts`, `prepare()` in `lobby.int.test.ts`, `e2e/helpers.ts`).
- **Radar** is emitted from `attachRoom` via `Room.onTick` (once per `radarIntervalMs` bucket, volatile). `AnonDot.flags` only carries `stale`/`oob`; Phase 4 adds visibility modes and imposter flags in `views/radar.ts` and must extend `views/leak.test.ts` (it already checks radar frames for ids, names, tokens and the salt).
- **Client location stack:** `store/location.ts` (fix, permission, wake lock, sim state), `net/geolocation.ts` (watchPosition singleton), `net/locationGate.ts` (send throttle: first fix, ≥1 s and ≥3 m, 5 s heartbeat; a fix older than `staleAfterS` is never re-sent), `components/LocationProvider.tsx` (headless: source, sender, wake lock), `sim/` (walk maths, `SimPanel`, `useSimLoop`, URL params). The sender shifts `ts` by the server clock offset.
- **Simulator:** active only when `lobby.testMode` and the player's `sim.on` (`?sim=1` pre-selects it). Long-press and marker drag use `dev:teleport` (ADR-042). E2E drives real Geoman via `window.__afterdarkMap` (`e2e/helpers.ts`: `drawCircle`, `mapPoint`, `longPress`).
- **Known quirk:** `loc:update` has its own 2/s limiter and silently drops extras and invalid fixes (no ack), so a client can't tell a rejected fix from an accepted one except through its view.
- **Formatting gotcha (unchanged):** run `npx eslint --fix` then `npx prettier --write` last, then `pnpm lint`.

_From Phase 01 (2026-11-23):_
- **Request path:** socket → `socket.use` rate limit (`socket/rateLimit.ts`) → `validated(event, schema, …)` → handler in `socket/handlers/{session,lobby}.ts` → `run(room, cmd)` → `Room.dispatch` → pure `engine/reduce.ts` → `systems/lobby.ts`. Rule rejections throw `RuleError(code)` inside systems; `run()` turns them into ack errors.
- **Engine shape:** `reduce(state, cmd, now)` deep-copies state (`structuredClone`) and systems mutate the draft, pushing `Effect`s (`{kind:'event', to, event}` or `{kind:'removed', playerId, reason}`). `tick(state, now)` is the same. `evaluateCountdown()` runs after every command. **Phase 2 adds `loc:update` as a command and more `StartBlocker`s** in `packages/shared/src/rules/start.ts` (shared with the client checklist): fresh fix for ready, boundary set.
- **Effects → sockets** happen in `socket/wiring.ts` (per-player emits only; no room broadcasts). Views go through `rooms/ViewEmitter.ts` (change-only by JSON fingerprint, throttled to `viewThrottleMs`). New view fields: add them in `views/projectView.ts` **and** in `ALLOWED_VIEW_KEYS` in `views/leak.test.ts` with an assertion.
- **Phase 2 radar:** `radar` is a separate event at `radarIntervalMs`, so hook it on the Room ticker (`Room.start(tickIntervalMs)`) or a second interval in `wiring.ts`; don't put dots into `PlayerView`.
- **Sessions:** tokens live only in `rooms/sessions.ts` (ADR-037). `socket.data = {playerId, code}` marks a bound socket. `bindSocket()` in `socket/context.ts` kicks an older socket with `replaced`.
- **Tests:** `apps/server/test/helpers.ts` has `startTestServer()` (mutable `clock.now`, seeded lobby codes), `TestClient` (`ok()`, `call()`, `waitForView()`, raw `frames`). Advance time with `ts.clock.now += …` then `ts.server.rooms.get(code)?.tick()`.
- **Client:** `useGame` store (view, notice, toasts, resuming) in `apps/client/src/store/index.ts`. Intents in `net/actions.ts`; `request(event, payload)` in `net/socket.ts` gives typed acks with a `TIMEOUT` code. Screens are routed in `App.tsx` from `view.lobby.phase` (`lobby` → Lobby, `starting` → placeholder). The Lobby's "Ready" button needs a location gate in Phase 2 (UI_UX §2 permission gate).
- **Formatting gotcha:** `pnpm format` runs prettier then `eslint --fix`, which can leave prettier diffs. Run `npx prettier --write <paths>` last, then `pnpm lint`.

_From Phase 00 (2026-11-23):_
- **Repo:** https://github.com/arunishrajput/afterdark (public, `main`, CI green). Every phase pushes to `main` and tags `phase-NN-done`.
- **Protocol pattern:** add each event to `packages/shared/src/protocol/schemas.ts` (zod) and `events.ts` (the typed `ClientToServerEvents`/`ServerToClientEvents` maps), then register it in `apps/server/src/socket/gateway.ts` wrapped in `validated(event, schema, logger, fn)`. To reject with a protocol error code, throw `new HandlerError('NOT_HOST', '…')`. `validated()` turns anything else into `INTERNAL`.
- **socket.io-client typing quirk:** `socket.timeout(ms).emitWithAck(...)` is typed `any`. Cast the awaited result to `Ack<T>`, and **never** assign `emitWithAck` to a variable, because it loses `this` and throws at runtime (lint catches this with `unbound-method`). See `apps/client/src/net/socket.ts` and the `ping()` helper in `apps/server/test/socket.test.ts`.
- **Config:** `DEFAULT_CONFIG` / `gameConfigSchema` / `editableConfigPatchSchema` / `HOST_CONFIG_TIER` come from `@afterdark/shared`. `lobby:updateConfig` should parse with `editableConfigPatchSchema` (strict: non-editable keys are rejected). `GameConfigPublic` (PROTOCOL `PlayerView.lobby.config`) doesn't exist yet. Phase 1 defines it, probably as `GameConfigEditable` plus the fixed keys the client needs.
- **Server deps injection:** `createServer({logger, now, version})`. Tests pass a fake `now` and a silent logger and listen on port 0 (see `apps/server/test/socket.test.ts`). Phase 1's RoomManager should receive `now` and an RNG factory the same way (Invariant 5, which lint enforces under `engine/` and `views/`).
- **Client:** the zustand store is in `apps/client/src/store/index.ts` (connection slice only for now). `useConnection.getState().offsetMs` gives the server-clock offset for countdowns. Theme switching uses `document.documentElement.dataset.theme`.
- **E2E:** `playwright.config.ts` starts the server and the client as two `webServer`s on `127.0.0.1` (and reuses running ones locally). Phase 1's multi-tab lobby specs can open several `browser.newContext()`s.
- **Local quirk:** another project on this machine ("Dead Signal") often holds `[::1]:5173`, so `localhost:5173` may show that app. Use `http://127.0.0.1:5173`. CI is unaffected.

## Environment
- Node: local v26.8.2; **pinned 24** (`.nvmrc`) for CI and Render, `engines >=24 <27` (ADR-030)
- pnpm 11.21.0 (`packageManager`); `allowBuilds: {esbuild: true}` in `pnpm-workspace.yaml`
- TypeScript ~6.0.3 (not 7: typescript-eslint requires <6.1, ADR-030); Vite 8, React 19, Tailwind 4, Zustand 5, Socket.IO 4.8, Express 5, zod 4, pino 10, Vitest 5, ESLint 10, Playwright 1.65
- git 2.54.0, gh 2.98.0 (logged in, `repo` and `workflow` scopes), cloudflared (Homebrew)
- Repo: https://github.com/arunishrajput/afterdark (public)
- CI: GitHub Actions `.github/workflows/ci.yml` (verify + Playwright e2e). Green at `phase-00-done`.

## Manual actions pending for the human
1. **(Optional, recommended) Real-phone check for Phase 2.** Follow [MANUAL_SETUP.md › Phase 2](docs/MANUAL_SETUP.md#phase-2-onward-testing-on-your-real-phone-optional-but-recommended): run `pnpm dev` and `pnpm tunnel`, open the tunnel URL on your phone, create a lobby, tap Allow location, and watch the blue marker. Open the lobby on a second device and check that the dot follows within about 2 s. Paste the accuracy you saw and any problems under **Field-test notes** (mark blockers 🔴).

## Known issues / tech debt
Format: `- 🔴/🟠/🟢 <issue> (found in phase NN): <notes>`
- 🟢 Kick is per session, not per person (found in phase 01): `lobby:join` carries no token, so a kicked player can rejoin under a new name from a fresh session. The host can kick again. Fixing it properly needs accounts (out of scope, ADR-029/037).
- 🟢 Countdown resolution (found in phase 01): the countdown expires on the 1 Hz tick, so `starting` can arrive up to `tickIntervalMs` late. Fine for a placeholder; Phase 4 could schedule an exact timer.
- 🟢 Initial JS is 125 KB gzipped (budget 300 KB, ARCHITECTURE §11); Leaflet and Geoman are a separate lazy 122 KB chunk loaded when a lobby opens. zod and turf are in the shared client bundle. Watch it as Phase 3 adds turf modules.
- 🟠 Real-phone GPS untested (found in phase 02): the simulator and server rules are tested, but accuracy, wake lock and the permission flow on iOS Safari and Android Chrome need the optional phone check (Manual actions).
- 🟢 OSM tiles (found in phase 02, ADR-039): fine for a small event; OSM's tile policy doesn't suit a public launch. Revisit a keyed provider in Phase 14.
- 🟢 A weak, noisy fix can make the next good fix look like a jump and delay re-anchoring by up to 3 fixes (ADR-040).
- 🟢 Boundary vertices (found in phase 02): a circle becomes a 64-vertex polygon, so editing its corners in Geoman is fiddly. Redrawing is easier.
- 🟢 Local port clash (found in phase 00): another project's Vite server listens on `[::1]:5173`, so `http://localhost:5173` can open that app instead. Use `http://127.0.0.1:5173`. Playwright already does.
- 🟢 Status-dot colours (found in phase 00): the connected/connecting dot uses Tailwind `emerald`/`amber` rather than theme tokens, because UI_UX §1 has no success or warning token. Revisit when the design system grows (Phase 13).

## Backlog (deferred ideas, not scheduled)
- Second co-op minigame `coop_signal` (stretch in Phase 11).
- Public rooms / matchmaking, accounts, stats (out of scope, ADR-029).
- AR/camera minigames (out of scope, ADR-029).

## Field-test notes
_The human pastes results here using the checklist in docs/TESTING.md §6. Mark blockers with 🔴._

## Session log
| Date | Phase | Summary |
|---|---|---|
| 2026-11-23 | 02 | Map, live location and boundary. Shared: geo basics on turf (distance, bearing, circle→64-gon, area, `kinks`, point-in-polygon, boundary validation with readable errors), `loc:update` / `lobby:setBoundary` / `dev:teleport` / `radar` protocol, `boundaryMissing` blocker, 4 config keys. Server: location system (future-fix reject, speed check with 3-fix re-anchor, derived good/weak/stale, `WEAK_GPS`/`STALE` ready gate), host boundary that un-readies everyone, test-mode teleport, per-viewer salted radar at 1 Hz, own `loc:update` rate limit; leak tests extended (own fix only, radar frames carry no ids/names/tokens/salt). Client: geolocation + wake lock + throttled sender, permission gate (iOS/Android help), lazy Leaflet map (dimmed outside, self marker with accuracy and oob state, radar dots with CSS glide, Fit, expand), Geoman boundary editor, full settings sheet with Quick/Standard/Long presets and target hint, GPS simulator (WASD/D-pad, accuracy slider, stale toggle, long-press teleport, `?sim=1`), TEST MODE badge. 264 unit+integration tests and 7 e2e (real Geoman drawing, two-player teleport/radar, oob, invalid boundary). Deviations: OSM tiles instead of CARTO (key now required), simulator jumps use `dev:teleport`. ADR-039–043. |
| 2026-11-23 | 01 | Lobby system end to end. Shared: Phase 1 events/schemas (NFC usernames with combining marks), view types, `startBlockers()`, `editableNumberRange()`, 4 new config keys. Server: pure lobby engine (join/leave/ready/config/kick/connect/disconnect, countdown → `starting`, host hand-over), Room + RoomManager (seeded/crypto codes, idle sweep), SessionRegistry (tokens outside engine state, kick bans), allow-list `projectView`, throttled change-only `ViewEmitter`, gateway with resume/replace and a 10/s rate limit. Leak harness with an exact key allow-list. Client: store, localStorage session, auto-resume, Home / Join-Create (safety notice) / Lobby (code, share, QR, roster, checklist, host settings, kick, countdown overlay) / notices / toasts. 146 unit+integration tests (incl. an 8-client socket scenario with a raw token scan) and 5 e2e. Deviations: lowest-RTT clock (ADR-038), 4 e2e contexts (min players). ADR-034–038. |
| 2026-11-23 | 00 | Set up the git repo and public GitHub repo; pnpm monorepo (shared/server/client); strict TS 6.0 + type-aware ESLint + Prettier; shared config (full CONFIG table as a zod schema), mulberry32 RNG, IDs, protocol `Ack`/`time:ping`; Express + Socket.IO server with `/health`, `/version` and validated `time:ping`; React + Tailwind client showing Connected ✓ + ping; Playwright smoke; CI green. 37 unit/integration + 2 e2e tests. 00.14 (permission allowlist): the human reviewed and added `.claude/settings.json`, because auto mode blocked Claude from writing its own permissions. ADR-030–033. |
| 2026-11-23 | (pre-project) | Wrote the specs (PRD, rules, roles, scoring, config, map/regions, tasks, meetings, protocol, architecture, UI/UX, testing, manual setup, decisions, INFILTR8 notes), the build plan with 15 phase files, CLAUDE.md and this tracker. Merged the creator's concept with the INFILTR8 GDD and added meetings and voting. |
