# Phase 05: Task Engine, 3-Stage Reveal, First Minigames, Crew Win

**Goal:** crew hold 3 tasks, each revealed in stages (direction → pin → minigame). Minigames are generated and verified on the server. Wire Connect and Lock Breaker are playable. Points, the team score, reroll, unsafe-point reports and the crew win (V1) work.

**Depends on:** Phase 4.

**Read first:**
- [TASKS.md §1–4, §6](../TASKS.md)
- [RULES.md §6](../RULES.md#6-playing-crew)
- [SCORING.md](../SCORING.md)
- [MAP_AND_REGIONS.md §3–4](../MAP_AND_REGIONS.md)
- [PROTOCOL.md](../PROTOCOL.md) (Phase 5 events, `TaskCard`)
- [ROLES.md](../ROLES.md) (task rows)
- [UI_UX.md](../UI_UX.md) (task card, minigame sheet, HUD)

**Skills to use:** `test-driven-development`, `api-and-interface-design` (the minigame interface), `frontend-ui-engineering`, `mobile-native`.

## Scope
- **In:** solo tasks only, the slot system, section-entry hysteresis, AT_PIN, the open/action/submit/cancel flow, the minigame framework, `wires` + `lock`, points, team and personal score, V1, reroll, report unsafe, interruptions (leaving the pin, stale, out of bounds), the fake-task *hook* (an empty queue for now), bots completing tasks.
- **Out:** co-op (10), fakes (9), other minigames (11).

## Tasks
- [x] **05.1 Minigame framework** (`shared/minigames/index.ts`): the `MinigameDef` interface (TASKS §3), a registry, weighted type selection, and a pattern for test-only solvers.
- [x] **05.2 `wires`:** generate, verify, symbols as well as colours. Tests: round-trip, a wrong mapping fails, puzzles are deterministic.
- [x] **05.3 `lock`:** a 3-digit code with digits 0–5, `act` feedback (correct place / wrong place counts), 8 guesses then a re-roll. Tests: feedback correctness, solvability.
- [x] **05.4 Task system** (`engine/systems/tasks.ts`):
  - slots, with the refill order: fake queue (empty for now) → co-op (disabled until Phase 10) → solo
  - choosing the target section and point (MAP §4 weights, rotation, ≥ 60 m when possible, no duplicates per player)
  - Stage 2 reveal after `sectionEntryHoldS` with hysteresis
  - AT_PIN within `reachRadiusM`
  - open: generate the puzzle and store the solution on the server
  - action, submit (wrong → 3 s lockout), cancel
  - abandon when the player is > 25 m from the pin, stale or out of bounds
  - completion → points → refill
  - reroll (cooldown 180 s), report unsafe (disable the point, refill)
  - TDD for each rule, including E4, E5 and E10
- [x] **05.5 Scoring and V1:** team score (genuine points only) and personal score. `checkVictory` V1 → crew win. Events `task.revealed`, `task.atPin`, `task.completed`.
- [x] **05.6 Views:** `game.tasks: TaskCard[]` with the staged fields (PROTOCOL). The type and points are **only** in the `task:open` ack. Imposters get `tasks: []`. Leak tests:
  - ASSIGNED cards have no coordinates
  - no card ever has a type or points
  - other players' tasks are never present
- [x] **05.7 Client:**
  - task cards in the bottom sheet: stage icon, "NE · Region A", distance, bearing arrow, tap to focus
  - section highlight polygon on the map (Stage 1), pins (Stage 2), "Start task" when at the pin
  - "Stop somewhere safe" interstitial
  - minigame sheet with lazy-loaded `Wires.tsx` and `LockBreaker.tsx`
  - success and failure feedback, a +N score float
  - reroll and report-unsafe in a card menu
  - haptic buzz and chime on section entry and at the pin (Android vibrate; audio fallback)
- [x] **05.8 Bots v2:** crew bots walk to their task sections and pins, open tasks, and complete them after 10–30 s (testMode `dev:autoComplete`, or test-only solvers). The integration test runs a full crew win.
- [x] **05.9 E2E:** a sim-mode player teleports into the section, sees the pin appear, teleports to the pin, solves the wires game through the UI and sees the score go up. A second test plays the lock game with the guess flow.
- [x] **05.10 Wrap up.** Update the docs (TASKS if any detail changed, PROTOCOL). Commit, tag, push.

## Acceptance criteria
- Stage 1 never sends coordinates. Stage 2 happens only after a 3 s good-fix hold inside the right section. The minigame type is unknown until it is opened.
- Answers are checked on the server. A client that forges `success` without the right answer is rejected (tested).
- Crew win when the team score reaches the target. Bots can drive a whole game to a crew win.
- Reroll and report work and respect their rules.

## Verification
```
pnpm verify && pnpm e2e
pnpm dev + pnpm bots -- --code <CODE> --count 7   # watch the score rise to a crew win
```

## Manual steps for the human
Optional: try a task on your phone through `pnpm tunnel`.

## Docs to update
TASKS.md, PROTOCOL.md, SCORING.md (if points changed), PROGRESS.md.
