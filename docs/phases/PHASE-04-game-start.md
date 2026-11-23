# Phase 04: Game Start Flow (State Machine, Spawn, Roles, Reveal, HUD, Zone, Bots v1)

**Goal:** from the end of the countdown to live play. Spread-out spawns, reach detection, assignment of roles, tags and classes, private hold-to-reveal, red/blue themes, the HUD skeleton (timer, infection boxes, team score), the game clock with pause, zone penalties, and host pause, abort and force start. A bot CLI lets 1 human + 7 bots reach play.

**Depends on:** Phase 3.

**Read first:**
- [RULES.md §1, §4, §5, §9, §10, §11, §12](../RULES.md) (V4–V6 only)
- [ROLES.md](../ROLES.md)
- [ARCHITECTURE.md §3](../ARCHITECTURE.md#3-the-engine-server-pure) (`GameClock`)
- [MAP_AND_REGIONS.md §5](../MAP_AND_REGIONS.md#5-spawn-points)
- [UI_UX.md](../UI_UX.md) (Spawn, Role reveal, Game HUD, themes)
- [PROTOCOL.md](../PROTOCOL.md) (Phase 4 events, `PlayerView.me.role/tag/imposter`)
- [TESTING.md §3, §5](../TESTING.md)

**Skills to use:** `test-driven-development`, `incremental-implementation`, `frontend-ui-engineering`, `doubt-driven-development` (the hidden-information projection).

## Scope
- **In:** phases `countdown → spawning → reveal → playing → ended`, spawn generation and assignment, roles/tags/classes, the imposter part of the view (allies, classes; no ability logic yet), themes, HUD skeleton, `GameClock` with pause, zone penalties, host controls, time-up end (V4 using only the team score for now, since compromised is 0), forfeit (V5), abort (V6), bots v1, a minimal ended screen.
- **Out:** tasks (5), infection (7), meetings (8), abilities (9–10), the full results screen (12).

## Tasks
- [x] **04.1 `GameClock`** (`engine/clock.ts`): game time, pause and resume, conversion of game-time deadlines to wall-clock time for views. Tests cover nested pause reasons (host pause and, later, meetings).
- [x] **04.2 State machine.** When the countdown ends, enter `spawning`. Then:
  - `reveal` happens when everyone has reached their spawn, or after the spawn timeout, or on host force start
  - after `roleRevealS`, `playing`
  - on a win or abort, `ended`

  Write tests for every transition and every illegal command per phase (`WRONG_PHASE`).
- [x] **04.3 Spawn system:** best-candidate spawns (≥ 40 m, maximised), greedy assignment, reach detection (good fix within `reachRadiusM`), the timeout, E3 relaxation and the invalid-setup error. Tests use a fake clock.
- [x] **04.4 Roles** (`engine/systems/roles.ts`):
  - imposter count rule (auto table, keeping at least 3 crew)
  - seeded shuffle
  - tags from `shared/tags.ts`: a themed word list of ≥ 40 words, unique per game, `WORD-NN`
  - classes drawn without repeats (`classes` mode), or all three (`all` mode)
  - fix `originalCrewCount` and the threshold

  Tests: distribution, uniqueness, a fixed seed gives a fixed result.
- [x] **04.5 View projection for roles.**
  - `me.tag`, `me.role`, and `me.imposter {classes, allies}` go to imposters only
  - `game.{clock, teamScore, targetScore, compromised, threshold, crewCount, regionCounts, meetingsLeft}`
  - **Leak tests:** crew views have no `imposter` key and contain no other player's tag; the host's view has the same shape as a non-host's; healthy and infected crew views have the same keys (infected can be faked in a fixture now)
- [x] **04.6 Zone system:** out of bounds = outside the boundary or inside a no-go zone (good fixes only). Grace, then personal penalties at intervals. A `locked` flag blocks tasks and abilities. The `oob` dot flag. Events `zone.warning` and `zone.penalty`. Penalties pause while the game clock is paused. Tests cover RULES §9.
- [x] **04.7 Host controls:** `game:pause` / `game:resume` (the clock freezes; every action except location is rejected with `PAUSED`), `game:forceStart` (spawning phase only), `game:abort` (→ ended, no winner). Host hand-over during the game (E31).
- [x] **04.8 Victory scaffolding** (`engine/systems/victory.ts`): `checkVictory(state)`, called after every reducer run and tick. It implements V4 with exact rational comparison, V5 forfeit (180 s of a side fully disconnected) and V6. V1–V3 are stubbed with TODOs naming the phase that adds each. Tests.
- [x] **04.9 Client screens:**
  - **Spawn:** your pin, distance, arrow, "x/y in position", host Force start
  - **Role reveal:** press-and-hold, crew blue with a shield / imposter red with a mask, tag, class cards, allies
  - **Game HUD skeleton:** timer (from the server clock, shows PAUSED), infection boxes (`crewCount` boxes with a threshold notch), team score bar, map, zone banner and edge glow, host menu (pause, abort)
  - **Ended (minimal):** winner and reason
  - The theme switches through `data-theme`
- [x] **04.10 Bot CLI v1** (`tools/bots`): `pnpm bots -- --url --code --count`. Bots join with a simulated fix near the Base, ready up, walk to their spawn at 1.4 m/s with jitter, then wander inside the boundary. Add `dev:addBots` (testMode, host) so the server can spawn in-process bots for demos. Choose and document the approach: in-process bots reuse the same command path.
- [x] **04.11 Integration test:** 8 socket clients: lobby → spawn → reveal → playing. Assert exactly 2 imposters (8 players), unique tags, and that imposters see each other while crew see no roles. Then a full scripted game to time-up (accelerated fake clock in the engine test), checking V4.
- [x] **04.12 E2E:** 1 browser context + 7 bots through to the playing HUD. Screenshot both a crew reveal and an imposter reveal (force the role with a test seed).
- [x] **04.13 Wrap up.** Update the docs. Commit, tag, push.

## Acceptance criteria
- 1 human + 7 bots reach `playing`. Each client sees only its own role. Imposters see their allies.
- Pausing freezes the timer on every client. Aborting ends the game.
- Zone penalties apply to personal score only, after a 15 s grace.
- Reconnecting during the game restores the role view.
- Leak tests pass for role, host and infected-shape cases.

## Verification
```
pnpm verify && pnpm e2e
pnpm dev   # then: pnpm bots -- --url http://localhost:3000 --code <CODE> --count 7
```

## Manual steps for the human
None.

## Docs to update
PROTOCOL.md, RULES.md (only if an edge case needed clarifying, with an ADR), PROGRESS.md, TESTING.md (bot usage).
