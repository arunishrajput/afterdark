# Testing Strategy

Claude can't walk around outside. So most of the game must be provable with **unit tests, socket integration tests, bots and Playwright in test mode**. Real-world field tests (done by the human) confirm GPS behaviour.

## 1. Commands (set up in Phase 0)
| Command | What it runs |
|---|---|
| `pnpm test` | Vitest across all packages (unit + integration) |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm lint` | ESLint (flat config) + Prettier check |
| `pnpm verify` | lint + typecheck + test + build. **Must be green before every commit that ends a phase.** |
| `pnpm e2e` | Playwright against the dev server, plus the `pwa` project against `vite preview` (Chromium) |
| `pnpm bots -- --code ABC123 --count 7 [--imposter-behaviour chase|sabotage] [--meetings random]` | Bot players (Phase 4+) |
| `pnpm tunnel` | cloudflared quick tunnel to the dev client, for real-phone HTTPS tests |
| `pnpm bots:load -- --lobbies 20 --players 8 [--duration 180] [--url …] [--server-log server.log] [--server-pid N]` | Load test (Phase 14): lobbies of hosting bots over real sockets; fix-to-own-view latency, and with the options the server's room tick and command times and its memory (§5) |
| `E2E_SERVER_PORT=3100 pnpm e2e` | The same e2e run with the game server on another port, when another local app holds 3000 (the Vite dev and preview servers follow through `AFTERDARK_SERVER_URL`) |

## 2. Test layers
| Layer | Location | Tools | What it covers |
|---|---|---|---|
| Unit: shared | `packages/shared/src/**/*.test.ts` | Vitest | Geo (distance, point-in-polygon, regions, `sectionOf`, sampling), config schema, RNG determinism, every minigame (`generate` → `verify` round-trip, solvability, wrong answers rejected), tag uniqueness |
| Unit: engine | `apps/server/src/engine/**/*.test.ts` | Vitest + a **fake clock** + seeded RNG | Every rule in RULES.md: state transitions, cooldowns, channel and gap tolerance, incubation, win checks (V1–V6), meeting tallies and ties, zone penalties, fake queue, co-op crediting |
| Unit: views | `apps/server/src/views/**/*.test.ts` | Vitest | The visibility matrix, through the leak tests (§3) |
| Integration | `apps/server/test/*.int.test.ts` | Vitest + in-process server + `socket.io-client` | Multi-client scenarios over real sockets: join/ready/start, reconnect, a full game driven by scripted clients |
| E2E | `e2e/*.spec.ts` | Playwright, several browser contexts, testMode | UI flows: create/join, host setup, spawn → reveal, task open/submit, meeting vote, results |
| Bots | `tools/bots/` | Node + socket.io-client | Load and balance runs, human + bots demos |
| Field | real phones outdoors | The human, with the checklist in §6 | GPS accuracy, latency, battery, wake lock, real fun |

**TDD rule for logic:** write the failing engine or shared test first, then the code. UI may be built first, then verified with Playwright.

## 3. Leak tests (mandatory from Phase 1)
Put these in `apps/server/src/views/leak.test.ts`. Extend them in every phase that adds view fields. Helpers (`keysDeep`, `buildLobbyFixture`, `FORBIDDEN_KEY_NAMES`) are in `views/leakHarness.ts`. Since Phase 1 the test also holds `ALLOWED_VIEW_KEYS`, an exact allow-list of view key paths: a new field fails the test until you add it there and assert who may see it. Integration tests record every raw frame (`TestClient.frames` in `apps/server/test/helpers.ts`) for item 7.
1. **No role leak:** a crew view contains no other player's role, class, tag (except the co-op partner tag inside a task card), or imposter-only flag. It contains no `imposter` key at all.
2. **Infection invisibility:** build two crew views that differ only in infected status. `keysDeep(viewA)` must equal `keysDeep(viewB)`, and neither may contain `infected`, `exposed`, `compromisedIds` or `incubation` anywhere.
3. **Fake indistinguishable:** for a real task card and a fake one at the same stage, the key sets are identical, and so is the shape of the `task:open` ack.
4. **Host has no powers:** the host's view after reveal is identical in structure to any other player's view of the same role.
5. **Spectator:** an ejected imposter's view has no `imposter` key.
6. **Radar:** crew radar dots never have `ally`, `exposed` or `infected` flags. In `regions` mode, crew radar is empty.
7. **Raw payload scan:** in an integration test, record every frame sent to a crew socket over a whole scripted game, then assert that no other player's tag or role, and no `infected` flag, appears in any frame. Scan only up to the end of the game: the results screen reveals everything on purpose (see 8).
8. **Results (Phase 12):** `views/leak.results.test.ts`: in the spawning, reveal and playing phases, with a busy event log and walk counters, no view has a `results` key or any of its field names (`scoreSeries`, `tasksDone`, `distanceM`, `infectedAtS`, `awards`, `timeline`, `walkedM`, `log`…); in the ended phase every viewer gets the identical `results` and every key is on `ALLOWED_VIEW_KEYS`; `apps/server/test/results.int.test.ts` scans a whole scripted game's raw frames for the same field names before the end. The secrecy tests of §3 run on views with `results` removed, because the reveal is the one place roles, classes and tags are public.

## 4. Test mode and the GPS simulator
- The host enables `testMode`, and every player sees a "TEST MODE" badge.
- **Simulator** (`apps/client/src/sim/GpsSimulator.tsx`):
  - long-press the map to teleport
  - drag the self marker
  - WASD or an on-screen D-pad to walk at 1.4 m/s (Shift = 3 m/s)
  - accuracy slider (5–50 m) to test weak GPS
  - a "go stale" toggle

  Walking sends normal `loc:update` events, so the server path is the same as real GPS. A long-press or marker drag teleports with `dev:teleport` (the bots use it too), because a big jump would otherwise fail the speed check (ADR-042). The simulator is active only while the lobby is in `testMode` and the player has it switched on; `?sim=1` pre-selects it.
- **URL helpers for Playwright:** `?sim=1&lat=..&lng=..` starts the simulator at a position. In dev (or with `?sim=…`) `window.__afterdarkMap` is the Leaflet map, so tests can convert lat/lng to pixels and drive the real Geoman tools (`e2e/helpers.ts`).
- **Task hooks (Phase 5):** `dev:setMinigames` limits the minigame types (so a spec can test `wires` or `lock` alone). Pages in dev or with `?sim` expose `window.__afterdarkActions = {devSetMinigames, simTeleport}`; `e2e/helpers.ts` has `toPlaying`, `spotInHighlight` (a spot inside the highlighted section, found from the SVG), `pinPosition` and `simTeleport`.
- In production, the `ALLOW_TEST_MODE` env var can turn test mode off entirely.
- **Reproducible roles:** the env var `TEST_ROOM_SALT` gives every new room that secret salt, so spawns and roles repeat. It is ignored unless test mode is allowed. The e2e server uses `e2e-a`: the host of an 8-player lobby is crew and the host of a 5-player lobby is an imposter (`e2e/game.spec.ts` relies on this; if you reuse a dev server that was started without the salt, those specs fail on the role).

## 5. Bots (`tools/bots`)
Two ways to get bots (ADR-056), both driven by the same shared `BotWalker`:
- **In-process, one click:** the host switches on test mode, then taps **Add 7 bots** in the lobby (`dev:addBots`). The bots ready up on their own; one human plus 7 bots is a full lobby. They are ordinary players in the room state, driven by the same commands a socket would cause.
- **Separate processes over real sockets:** `pnpm bots -- --code ABC123 --count 7 [--url http://localhost:3000] [--speed 1] [--seed 1]`. `--speed` multiplies the walking speed (the server still rejects jumps above `maxSpeedMps`, so keep it ≤ 8).
- `pnpm bots -- --url http://localhost:3000 --code ABC123 --count 7`
- Each bot:
  - joins with a name like `bot-3`
  - readies with a simulated fix near the Base
  - walks toward its spawn at ~1.4 m/s with GPS jitter (±3 m)
  - (Phase 5) crew bots work through their first task card: they find a spot in the card's section (`pointInSection`), hold there until the pin appears, walk to the pin and open the task
  - in testMode, completes each task after a `botTaskMinS`–`botTaskMaxS` (10–30 s) delay using `dev:autoComplete`; the integration tests and e2e specs solve puzzles with test-only solvers written in the test files
  - joins its co-op tasks (Phase 10, ADR-088): works a co-op card before any solo one, starts or joins at the pin and types the other side's PIN after the work wait (it reads it from the room state; a human partner of a bot is shown the bot's PIN as `botShows` in test mode). A waiting owner who is also somebody's partner cancels and goes to help. `sabotage` imposter bots disguise themselves and stand in when a crew member waits within `botStandInRangeM`. CLI bots share a PIN board in their process, so two CLI bots finish a co-op together; a human partner's PIN is unreadable to them, so that task expires
  - (Phase 8) in a meeting they walk to the Base, skip the discussion and vote at random among the active players (Skip with `botVoteSkipPercent`; an imposter bot never votes for an ally). `--meetings random` (or `dev:addBots {meetings:'random'}`) also makes each bot call one meeting at a random game time between `botMeetingMinS` and `botMeetingMaxS`; without it bots only join the meetings humans call
- **Imposter bots:**
  - `--imposter-behaviour chase` (Phase 7, ADR-069): imposter bots walk to the nearest crew-looking dot on their radar, start Infect when within `infectionRadiusM − 3 m`, keep following during the channel, then walk 20 m away so the incubation can start. Set the lobby's visibility to **Everyone** so they see far. In-process bots (`dev:addBots {imposterBehaviour:'chase'}`) do the same from the room state
  - `--imposter-behaviour sabotage` (Phase 9, ADR-080): chase as above, and also use every class ability the moment it is ready: Task Stop (when no lock runs) and Fake Task (a random spot within `botFakeScatterM` of the Base; the server refuses an invalid one and the bot tries another next step). Pair it with `imposterAbilityMode: 'all'` so every imposter bot has both
  - `wander` (default): they walk like everyone else and never infect
- **Balance script** (Phase 11, ADR-094): `pnpm bots:simulate --games 50 --players 8 [--config overrides.json] [--radius 200] [--meetings off|random] [--seed a] [--jobs 4] [--json]` plays headless games with the real engine and the in-process `BotDriver` in a `Room` whose clock is injected and moves one second per step (a 25-minute game takes about a second). Every player is a bot; the host plays too. It prints the imposter, crew and draw rates, the median game length (game minutes), how games ended (score, infection, time, ejection) and the split between early endings and time-up, tasks per crew member, co-op tasks per game and their share of team points, infections, meetings and Task Stops per game. `--config` takes a JSON object of config keys (checked against the schema: a typo is an error); `--jobs N` splits the games over N processes with identical results. The code is `apps/server/src/sim/` (`runGame.ts`, `summary.ts`, `cli.ts`).
  - **Bot pace used by the script** (`SIM_BOT_CONFIG`, assumptions to re-check after a field test): a crew bot waits 30–60 s at a pin, times `botTaskTimeScale[type]`; Key Fetch is played for real (both legs); imposters hunt only what is within `botChaseSightM` = 20 m; a quarter of the bots ever call a meeting; crew bots vote for a real imposter 35% of the time (`botVoteSuspicionPercent`), otherwise at random or Skip. In-process bots finish games with `dev:autoComplete` except Key Fetch.

- **Load test** (Phase 14, `tools/bots/src/load.ts`): `pnpm bots:load` creates `--lobbies` lobbies one after another. In each, a hosting bot creates it, switches on test mode with visibility Everyone and all imposter abilities, draws a 200 m circle and plays; `--players − 1` bots join. Imposters chase and sabotage and every bot calls one meeting (`meetings: 'random'`), so infection, abilities, meetings and co-op all run; a spawn phase over 30 s is force-started. It prints progress every 10 s and, after `--duration` seconds, the phases reached, the **fix → own view** latency (p50/p95/p99/max: from a bot sending a fix to that fix showing in its own view, which includes the 200 ms view throttle) and, with `--server-pid`, the server's RSS. With `--server-log` (the server started with `LOG_LEVEL=debug` and its stdout saved to that file) it reads every "room operation" line (`Room.ts` logs each command and tick with its duration to 0.01 ms) and prints tick and command percentiles and the count of slow (≥ `slowCommandMs`) operations. Local runs come from loopback, which the per-address lobby limit exempts; against a deployed server one address may create only 5 lobbies a minute (ADR-107). Phase 14 results are in PROGRESS.md.

## 6. Field-test checklist (the human runs this, from Phase 6)
Do this with at least 2 phones (one iOS, one Android if possible), outdoors.
1. Open the deployed URL, create and join a lobby, grant location, ready, start.
2. Record the GPS accuracy each phone shows when still: ___ m, and while walking: ___ m.
3. Walk 50 m: does the other phone's dot follow within ~2 s (in `all` mode)?
4. Lock the screen for 20 s, then unlock: does the app recover, and did the dot go stale and come back?
5. Do 3 tasks: did the section highlight → pin → at-pin progression feel right? Note distances.
6. Leave the boundary: warning after 0 s, penalty after 15 s?
7. Battery drop over 20 min of play: ___% (note the phone, brightness and whether Battery Saver was on). Compare a stationary stretch with a walking one if you can.
8. Install: did "Install AfterDark" (Android) or Add to Home Screen (iOS) work, and does it open full screen in the dark theme?
9. Reconnect: switch to airplane mode for 20 s mid-game, then back. Did "Reconnecting…" show, and did the game resume by itself? Lock the screen for 30 s: did you see "You were away"?
10. Anything confusing or annoying: free text.

Paste the results into PROGRESS.md under **Field-test notes**. Mark blockers with 🔴 so the next session fixes them first.

- **Security and regression (Phase 14):** `apps/server/test/fuzz.int.test.ts` sends junk to every client event (unbound and bound sockets) and proves every `dev:*` event is refused without test mode; `test/limits.int.test.ts` covers the lobby creation limits and the 16 KB frame cap; `packages/shared/src/minigames/hostile.test.ts` feeds every minigame and the co-op PIN hostile bodies; `test/configDoc.test.ts` keeps `docs/CONFIG.md` equal to `DEFAULT_CONFIG`. `e2e/fullgame.spec.ts` plays one 8-player game with two humans (crew host; an imposter guest, who joins before the bots so the pinned salt gives them seat 1) through setup, a task, Task Stop, an infection of the host, a co-op between the two, a meeting, time-up, results and Play again, and scans every raw payload the crew host got before the end for hidden information. Pin reveals in e2e use the `spotInCard` test hook (`pointInSection`, the server's own rule) before falling back to the drawn highlight.
- **Layout spec (UI/UX pass):** `e2e/layout.spec.ts` loads the lobby, the settings sheet and How to play at 360 px with mobile emulation and fails if the document is wider than the screen (the cause of the "zoomed out" lobby on Chrome Android); it also checks the game's full-screen map, the map buttons and attribution above the sheet, and the sheet collapsing to one card. Specs that aim at the map must use the area or the crosshair, not the map's own centre: the full-screen map centres the area in the band between the HUD and the sheet (`e2e/helpers.ts › pointOf`).
- **PWA specs (Phase 13):** `e2e/pwa.spec.ts` runs in its own Playwright project against the production build (`vite preview` on :4173, started by the config after a build), because the service worker exists only there: the manifest and icons, and the shell loading with `context.setOffline(true)` after two online loads. `e2e/polish.spec.ts` (dev server) covers How to play, the sound toggle, the update banner's queue (Home and lobby yes, mid-game no, via the `pwaNeedRefresh` test hook) and the reconnect banner (via `dropConnection`). `apps/server/test/clientCopy.test.ts` is the "no run wording" lint.
- **Lighthouse** (manual, Phase 13): `pnpm build`, serve it with `NODE_ENV=production PORT=3100 node apps/server/dist/index.js`, then `npx lighthouse@12 http://localhost:3100/ --form-factor=mobile --only-categories=performance,accessibility,best-practices,seo`. Phase 13 result: 87 / 100 / 96 / 100.

## 7. Definition of Done for tests in each phase
- Every new rule has engine tests, including edge cases from the RULES.md table that are now in scope.
- Leak tests are extended for every new view field.
- At least one e2e or integration "happy path" covers the phase's demoable outcome.
- `pnpm verify` is green, and CI is green after the push.
