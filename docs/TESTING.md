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
| `pnpm e2e` | Playwright against the dev or preview servers (Chromium) |
| `pnpm bots -- --code ABC123 --count 7 [--imposter-behaviour chase]` | Bot players (Phase 4+) |
| `pnpm tunnel` | cloudflared quick tunnel to the dev client, for real-phone HTTPS tests |

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
7. **Raw payload scan:** in an integration test, record every frame sent to a crew socket over a whole scripted game, then assert that no other player's tag or role, and no `infected` flag, appears in any frame.

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
- In production, the `ALLOW_TEST_MODE` env var can turn test mode off entirely.

## 5. Bots (`tools/bots`)
- `pnpm bots -- --url http://localhost:3000 --code ABC123 --count 7`
- Each bot:
  - joins with a name like `bot-3`
  - readies with a simulated fix near the Base
  - walks toward its spawn at ~1.4 m/s with GPS jitter (±3 m)
  - walks toward its task points and opens them
  - in testMode, completes each task after a 10–30 s delay using `dev:autoComplete`, or by solving it with test-only solvers
  - joins its co-op tasks
  - votes at random (or Skip) in meetings
- **Imposter bots:**
  - `--imposter-behaviour chase` follows the nearest crew member and channels Infect
  - `idle` does nothing
- **Balance script** (Phase 11): `pnpm bots:simulate --games 50 --players 8` runs headless games at accelerated game time (injected clock) and prints the win rate, average length and tasks per player.

## 6. Field-test checklist (the human runs this, from Phase 6)
Do this with at least 2 phones (one iOS, one Android if possible), outdoors.
1. Open the deployed URL, create and join a lobby, grant location, ready, start.
2. Record the GPS accuracy each phone shows when still: ___ m, and while walking: ___ m.
3. Walk 50 m: does the other phone's dot follow within ~2 s (in `all` mode)?
4. Lock the screen for 20 s, then unlock: does the app recover, and did the dot go stale and come back?
5. Do 3 tasks: did the section highlight → pin → at-pin progression feel right? Note distances.
6. Leave the boundary: warning after 0 s, penalty after 15 s?
7. Battery drop over 20 min of play: ___%.
8. Anything confusing or annoying: free text.

Paste the results into PROGRESS.md under **Field-test notes**. Mark blockers with 🔴 so the next session fixes them first.

## 7. Definition of Done for tests in each phase
- Every new rule has engine tests, including edge cases from the RULES.md table that are now in scope.
- Leak tests are extended for every new view field.
- At least one e2e or integration "happy path" covers the phase's demoable outcome.
- `pnpm verify` is green, and CI is green after the push.
