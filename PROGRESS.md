# AfterDark: Progress Tracker

> **Every session starts here.** Claude reads this file first (see CLAUDE.md → session protocol) and updates it before ending.
> Status legend: `☐ NOT STARTED` · `▶ NEXT` · `◐ IN PROGRESS` · `✅ DONE` · `⏸ BLOCKED`

## Current status
**◐ IN PROGRESS: Phase 01, Lobby system** (started 2026-11-23) → [docs/phases/PHASE-01-lobby.md](docs/phases/PHASE-01-lobby.md)

**Live URL:** _not deployed yet (Phase 06)_

## Phase table
| # | Phase | Status | Date | Tag / notes |
|---|---|---|---|---|
| 00 | [Setup & scaffolding](docs/phases/PHASE-00-setup.md) | ✅ DONE | 2026-11-23 | `phase-00-done` |
| 01 | [Lobby system](docs/phases/PHASE-01-lobby.md) | ◐ IN PROGRESS | 2026-11-23 | |
| 02 | [Map, location & boundary](docs/phases/PHASE-02-map-location-boundary.md) | ☐ NOT STARTED | | |
| 03 | [Regions, sections & task points](docs/phases/PHASE-03-regions-task-points.md) | ☐ NOT STARTED | | |
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
_None right now._

## Known issues / tech debt
Format: `- 🔴/🟠/🟢 <issue> (found in phase NN): <notes>`
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
| 2026-11-23 | 00 | Set up the git repo and public GitHub repo; pnpm monorepo (shared/server/client); strict TS 6.0 + type-aware ESLint + Prettier; shared config (full CONFIG table as a zod schema), mulberry32 RNG, IDs, protocol `Ack`/`time:ping`; Express + Socket.IO server with `/health`, `/version` and validated `time:ping`; React + Tailwind client showing Connected ✓ + ping; Playwright smoke; CI green. 37 unit/integration + 2 e2e tests. 00.14 (permission allowlist): the human reviewed and added `.claude/settings.json`, because auto mode blocked Claude from writing its own permissions. ADR-030–033. |
| 2026-11-23 | (pre-project) | Wrote the specs (PRD, rules, roles, scoring, config, map/regions, tasks, meetings, protocol, architecture, UI/UX, testing, manual setup, decisions, INFILTR8 notes), the build plan with 15 phase files, CLAUDE.md and this tracker. Merged the creator's concept with the INFILTR8 GDD and added meetings and voting. |
