# Phase 02: Map, Live Location and Boundary

**Goal:** a dark Leaflet map with live positions from real GPS (or the simulator in test mode). A server-side location pipeline that checks plausibility. The host draws the playable boundary. The full settings panel with presets. "Ready" now requires a good location fix.

**Depends on:** Phase 1.

**Read first:**
- [MAP_AND_REGIONS.md §1, §6, §7](../MAP_AND_REGIONS.md)
- [ARCHITECTURE.md §5](../ARCHITECTURE.md#5-location-pipeline)
- [RULES.md §10](../RULES.md#10-connectivity)
- [CONFIG.md](../CONFIG.md) (location + map)
- [TESTING.md §4](../TESTING.md#4-test-mode-and-the-gps-simulator)
- [PROTOCOL.md](../PROTOCOL.md) (`loc:update`, `lobby:setBoundary`, `radar`, `dev:teleport`)
- [UI_UX.md](../UI_UX.md) (Host setup, Permission gate)

**Skills to use:** `source-driven-development` (react-leaflet, Leaflet-Geoman, turf, Geolocation and Wake Lock APIs), `test-driven-development`, `frontend-ui-engineering`, `mobile-native`.

## Scope
- **In:** geo basics, the location pipeline, radar in the lobby (`all`-style anonymous dots, for convenience while gathering), the boundary editor, the settings panel and presets, the permission gate, wake lock, the GPS simulator, `testMode`.
- **Out:** regions, sections, task points and the Base (Phase 3).

## Tasks
- [ ] **02.1 Shared geo basics** (`geo/distance.ts`, `geo/boundary.ts`), with tests:
  - haversine distance
  - bearing
  - point-in-polygon (`@turf/boolean-point-in-polygon`)
  - circle → 64-gon
  - polygon area (`@turf/area`)
  - simple-polygon validation (no self-intersections, via `@turf/kinks`)
  - area limits from CONFIG
- [ ] **02.2 Server location system** (`engine/systems/location.ts`):
  - validate fixes and reject future timestamps
  - speed check with the 3-fix re-anchor
  - quality derivation: good, weak or stale (at tick)
  - store the latest fix per player

  Write tests for every rule in RULES §10.
- [ ] **02.3 Radar** (`views/radar.ts`): per-viewer anonymous dots with rotating aliases (`dotAliasRotateS`) and only the public flags (`stale`, `oob`). Emit `radar` at 1 Hz to every lobby member. Extend the leak tests: no player IDs or usernames in the radar.
- [ ] **02.4 Client geolocation.** `useGeolocation` (watchPosition with high accuracy, permission state, error handling) sends with throttling (`locationSendIntervalMs`, `locationMinMoveM`, 5 s heartbeat). `useWakeLock` acquires during lobby and game and re-acquires on `visibilitychange`.
- [ ] **02.5 Permission gate screen.** Explains why, shows an Allow button, troubleshoots denied and unsupported cases with iOS and Android tips (from MANUAL_SETUP), and shows live accuracy. **Ready is disabled until the quality is good.** The server rejects `setReady(true)` without a good fix and responds `WEAK_GPS`.
- [ ] **02.6 Map component.**
  - react-leaflet with CARTO Dark Matter tiles and attribution
  - self marker with an accuracy circle and heading
  - radar dots layer, with CSS-transition movement
  - fit-to-boundary control
  - lazy-loaded so the Home screen stays light
- [ ] **02.7 Boundary editor** (host). Leaflet-Geoman with polygon and circle tools: draw, edit, delete. Send `lobby:setBoundary`. The server validates and stores it and un-readies everyone. Every client's lobby map shows the boundary, with the area outside it dimmed.
- [ ] **02.8 Settings panel** (host). Every ✅ and ⚙️ field from CONFIG.md, driven by the config schema (ranges, enums), plus presets: **Quick** (15 min, target 70), **Standard** (25 min, target 100), **Long** (40 min, target 150). Show the suggested target (`16 × crew`) as a hint.
- [ ] **02.9 Test mode and simulator.** The host toggles `testMode` (the server honours `ALLOW_TEST_MODE`), and a badge appears for everyone. Build `GpsSimulator`:
  - long-press to teleport
  - drag the marker
  - WASD or D-pad walking at 1.4 m/s (Shift: 3 m/s)
  - accuracy slider
  - stale toggle
  - URL params `?sim=1&lat=&lng=`

  It feeds the same send path. `dev:teleport` is accepted only in testMode.
- [ ] **02.10 Out-of-bounds flag in the lobby** (display only): the self marker turns red outside the boundary, and the `oob` flag goes on the dots. Penalties come in Phase 4.
- [ ] **02.11 E2E.** Two contexts in sim mode: the host draws a circle boundary (programmatically if Geoman is hard to drive, through a test hook), the guest sees it, both teleport and see each other's dot move, and Ready is blocked until there is a fix.
- [ ] **02.12 Wrap up.** Update the docs (PROTOCOL, CONFIG if any changed), PROGRESS. Commit, tag, push.

## Acceptance criteria
- On a real phone through `pnpm tunnel`, the self marker tracks the player, and another device sees the anonymous dot move within about 2 s.
- The simulator works on desktop. Test mode is visible to everyone.
- An invalid boundary (self-intersecting, too small or too large) is rejected with a clear message.
- A boundary or settings change un-readies everyone.
- Speed and stale rules are covered by tests. The radar leak tests pass.

## Verification
```
pnpm verify && pnpm e2e
```
Use the Playwright MCP to screenshot the host setup and the lobby map. Then do the optional phone test (below).

## Manual steps for the human (optional)
Real-phone check: follow [MANUAL_SETUP.md › Phase 2](../MANUAL_SETUP.md#phase-2-onward-testing-on-your-real-phone-optional-but-recommended), then report the accuracy you saw and whether the dot followed.

## Docs to update
PROGRESS.md, PROTOCOL.md, CONFIG.md (if any tweak), DECISIONS.md.
