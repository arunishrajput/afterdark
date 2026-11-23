# Build Plan: One Phase per Claude Code Session

**How this works:** each phase is sized to fit one session. The human types **"Start the next phase"**. Claude follows the session protocol in [CLAUDE.md](../CLAUDE.md), builds the phase, verifies it, updates [PROGRESS.md](../PROGRESS.md), commits, tags `phase-NN-done` and pushes. Then the human runs `/clear` and repeats.

Phases are ordered so that **a playable game exists early**: the solo-task loop by Phase 5, deployment in Phase 6, and the full social-deduction core by Phase 8. Later phases add to that. Each phase leaves `main` green and demoable.

## Phase index
| # | File | Goal | Depends on | Outcome you can demo |
|---|---|---|---|---|
| 0 | [PHASE-00-setup.md](phases/PHASE-00-setup.md) | Repo, tooling, scaffold, CI | — | `pnpm dev` shows "Connected ✓"; CI green |
| 1 | [PHASE-01-lobby.md](phases/PHASE-01-lobby.md) | Lobby system end to end | 0 | 8 browser tabs join one lobby, ready up, reconnect |
| 2 | [PHASE-02-map-location-boundary.md](phases/PHASE-02-map-location-boundary.md) | Map, live location, boundary, settings | 1 | Host draws the area; live dots move (simulator or phone) |
| 3 | [PHASE-03-regions-task-points.md](phases/PHASE-03-regions-task-points.md) | Regions, 9 sections, task-point pool, Base, visibility | 2 | Host preview of regions, sections and points; region counts |
| 4 | [PHASE-04-game-start.md](phases/PHASE-04-game-start.md) | State machine, spawn, roles, reveal, HUD, zone, bots v1 | 3 | 1 human + 7 bots: spawn → reveal → play |
| 5 | [PHASE-05-tasks-core.md](phases/PHASE-05-tasks-core.md) | Task engine, 3-stage reveal, Wires + Lock, crew win | 4 | Crew can win by doing tasks |
| 6 | [PHASE-06-deploy-field-test.md](phases/PHASE-06-deploy-field-test.md) | Render deploy, smoke test, field test | 5 | Public HTTPS URL; real phones play |
| 7 | [PHASE-07-infection.md](phases/PHASE-07-infection.md) | Infect, incubation, compromised, imposter win, time-up | 5 | Imposters can win by infection |
| 8 | [PHASE-08-meetings-voting.md](phases/PHASE-08-meetings-voting.md) | Meetings, votes, ejection, spectators | 7 | Full social-deduction loop |
| 9 | [PHASE-09-abilities-saboteur-phantom.md](phases/PHASE-09-abilities-saboteur-phantom.md) | Ability framework, Task Stop, Fake Task | 8 | Saboteur and Phantom playable |
| 10 | [PHASE-10-coop-camouflage.md](phases/PHASE-10-coop-camouflage.md) | Co-op tasks, PIN relay, Camouflage, recovery | 9 | Co-op bluffing works |
| 11 | [PHASE-11-minigames-balance.md](phases/PHASE-11-minigames-balance.md) | Remaining 5 minigames, balance simulation | 10 | Full catalog; tuned defaults |
| 12 | [PHASE-12-results-replay.md](phases/PHASE-12-results-replay.md) | Results screen, rematch, end early | 11 | Satisfying end of game |
| 13 | [PHASE-13-pwa-polish.md](phases/PHASE-13-pwa-polish.md) | PWA, mobile polish, safety UX, How-to-Play | 12 | Installable, polished app |
| 14 | [PHASE-14-hardening-demo.md](phases/PHASE-14-hardening-demo.md) | Security, load, regression, final tuning, demo | 13 | v1.0.0 and demo script |

**Sequencing notes:**
- Phase 6 (deploy) needs only Phase 5. It comes early so every later push auto-deploys and the human can field-test as features land.
- If the hackathon deadline gets close, Phases 11–13 can be cut down. Phase 14's demo script still works with fewer minigames.

## Shared Definition of Done (every phase)
1. Every task in the phase checklist is done, or explicitly moved to the backlog in PROGRESS.md with a reason.
2. Every acceptance criterion is verified **with evidence**: test output, Playwright screenshot or trace, bot run log.
3. `pnpm verify` is green locally. CI is green after the push.
4. Leak tests are extended for any new view field ([TESTING.md §3](TESTING.md#3-leak-tests-mandatory-from-phase-1)).
5. Docs match the code: CONFIG, PROTOCOL, RULES and any spec the phase touched. New decisions go in DECISIONS.md.
6. PROGRESS.md is updated: phase status ✅, a session log entry, deviations, known issues, handoff notes, and manual steps for the human.
7. Commits use conventional messages, and the phase ends with the `phase-NN-done` tag pushed.

## Who does what
| Claude Code | The human |
|---|---|
| All code, tests, docs, commits, pushes, CI, deploy config | Answers Claude's questions (repo name, product choices) |
| Runs and verifies with tests, Playwright and bots | Approves permission prompts |
| Writes clear manual instructions when needed | Logins and accounts (GitHub, Render) |
| Updates PROGRESS.md every session | Real-phone and outdoor field tests; pastes notes into PROGRESS.md |
| Keeps rules consistent and records decisions | Final say on game design (override any "Accepted" ADR) |

## Phase file template (every phase file follows it)
```
# Phase NN: Title
Goal · Depends on · Read first · Skills to use
Scope (in / out)
Tasks (ordered checklist: NN.k, with files and an acceptance line each)
Acceptance criteria
Verification (commands and checks)
Manual steps for the human
Docs to update at the end
```
