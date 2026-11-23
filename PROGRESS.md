# AfterDark: Progress Tracker

> **Every session starts here.** Claude reads this file first (see CLAUDE.md → session protocol) and updates it before ending.
> Status legend: `☐ NOT STARTED` · `▶ NEXT` · `◐ IN PROGRESS` · `✅ DONE` · `⏸ BLOCKED`

## Current status
**◐ IN PROGRESS: Phase 00, Project Setup and Scaffolding** (started 2026-11-23) → [docs/phases/PHASE-00-setup.md](docs/phases/PHASE-00-setup.md)

**Live URL:** _not deployed yet (Phase 06)_

## Phase table
| # | Phase | Status | Date | Tag / notes |
|---|---|---|---|---|
| 00 | [Setup & scaffolding](docs/phases/PHASE-00-setup.md) | ◐ IN PROGRESS | 2026-11-23 | |
| 01 | [Lobby system](docs/phases/PHASE-01-lobby.md) | ☐ NOT STARTED | | |
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
- The repo isn't a git repository yet, and nothing has been committed. Phase 00 does `git init`, the first commit of these docs, and creates the GitHub repo (ask the user for the name and visibility).
- On 2026-11-23 the machine had: Node v26.8.2, pnpm 11.21.0, git 2.54.0, gh 2.98.0 (logged in as the repo owner, with `repo` and `workflow` scopes), cloudflared and ngrok, Docker, Homebrew. The git identity is configured.
- The Playwright MCP is available to Claude for visual checks.
- All game design is final for v1. See `docs/DECISIONS.md` for the choices Claude made that the creator can override.

## Environment
_Filled in by Phase 00: Node major pinned, pnpm version, repo URL, CI status._

## Manual actions pending for the human
_None right now._ (Phase 00 will ask for the GitHub repo name and visibility.)

## Known issues / tech debt
_None yet._ Format: `- 🔴/🟠/🟢 <issue> (found in phase NN): <notes>`

## Backlog (deferred ideas, not scheduled)
- Second co-op minigame `coop_signal` (stretch in Phase 11).
- Public rooms / matchmaking, accounts, stats (out of scope, ADR-029).
- AR/camera minigames (out of scope, ADR-029).

## Field-test notes
_The human pastes results here using the checklist in docs/TESTING.md §6. Mark blockers with 🔴._

## Session log
| Date | Phase | Summary |
|---|---|---|
| 2026-11-23 | (pre-project) | Wrote the specs (PRD, rules, roles, scoring, config, map/regions, tasks, meetings, protocol, architecture, UI/UX, testing, manual setup, decisions, INFILTR8 notes), the build plan with 15 phase files, CLAUDE.md and this tracker. Merged the creator's concept with the INFILTR8 GDD and added meetings and voting. |
