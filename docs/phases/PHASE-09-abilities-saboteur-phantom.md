# Phase 09: Ability Framework, Saboteur (Task Stop) and Phantom (Fake Task)

**Goal:** a generic, server-authoritative ability framework (cooldowns, initial cooldown, freezes for meetings, pauses and out-of-bounds, post-meeting grace, recovery hooks) with two class abilities: **Task Stop** and **Fake Task**. Also the `all` abilities mode.

**Depends on:** Phase 8.

**Read first:**
- [RULES.md §7, §7.2, §7.3, §13](../RULES.md) (E11–E16)
- [TASKS.md §6–7](../TASKS.md)
- [ROLES.md › Imposter classes](../ROLES.md#imposter-classes)
- [CONFIG.md › Imposter abilities](../CONFIG.md#imposter-abilities)
- [PROTOCOL.md](../PROTOCOL.md) (`ability:taskStop`, `ability:fakeTask`, `AbilityState`, `taskLock`, `fakes`)
- [UI_UX.md](../UI_UX.md) (ability bar, Task Stop overlay, Fooled overlay)
- [DECISIONS.md](../DECISIONS.md) ADR-009, 016, 017

**Skills to use:** `api-and-interface-design` (the ability framework), `test-driven-development`, `frontend-ui-engineering`.

## Scope
- **In:** the ability framework, Task Stop, Fake Task and the fake queue, the fooled flow, `imposterAbilityMode: 'all'`, the ability-bar UI, overlays, Phantom pin mode, bot imposters using abilities.
- **Out:** Camouflage and cooldown recovery (Phase 10; build `applyRecovery()` here as a tested no-op hook).

## Tasks
- [ ] **09.1 Ability framework** (`engine/systems/abilities.ts`): a registry of `{id, class, cooldownS, canActivate(state, actor), activate(state, actor, payload)}`. Per imposter per ability: `readyAt` in game time and an optional `activeUntil`. Common checks:
  - active imposter with this ability
  - not paused, not in a meeting, not within `postMeetingGraceS`
  - in bounds, not stale
  - off cooldown

  Initial cooldown `abilityInitialCooldownS` at play start. Cooldowns freeze while out of bounds; implement this as a per-player paused-time accumulator. `applyRecovery(actor, fraction)` reduces the remaining class-ability cooldowns. Unit tests for every check.
- [ ] **09.2 Task Stop:** reset every IN_PROGRESS task (solo now, and co-op once Phase 10 hooks in) to AT_PIN; `taskLock.until = now + taskStopLockS`; reject `task:open/action/submit` with `TASKS_LOCKED`; can't activate while a lock is active (E12); the lock time freezes during meetings (E23). Public event `sabotage.started {until}`. Tests for E11, E12, E23 and key-fetch keys kept (placeholder test until Phase 11 adds keyfetch).
- [ ] **09.3 Fake Task:**
  - validate the pin: inside the boundary, outside no-go zones, ≥ `fakeTaskMinDistanceM` from points and fakes (E13)
  - enforce `fakeTaskMaxActive` (E14)
  - compute `sectionOf`
  - enqueue
  - the slot refill (from Phase 5) now takes from the queue first
  - fake tasks use a random solo minigame type other than keyfetch and follow the normal 3-stage reveal
  - a correct submit returns `result:'fooled'`, 0 points, then refill
  - reroll and report remove the fake and free the Phantom's count (E16)
  - an ejected Phantom's queued fakes are removed (Phase 8 hook)

  Tests: E13–E16, the GDD's "A fake task never increases genuine task completion", and queue ordering.
- [ ] **09.4 `all` mode:** every imposter has all three abilities, each with its own cooldown. Camouflage stays disabled until Phase 10, shown as "coming soon" behind a flag only in dev.
- [ ] **09.5 Views and leak tests:**
  - `me.imposter.abilities[]`, `me.imposter.fakes[]` (Phantom), ally cooldowns for imposters
  - `game.taskLock` is public
  - **fake indistinguishability leak test:** a real and a fake TaskCard at every stage have identical key sets, and the `task:open` acks have identical shapes
- [ ] **09.6 Client:**
  - ability bar: class icon buttons with cooldown rings and the disabled reason
  - Task Stop: confirm, then the global "SYSTEMS JAMMED" overlay with countdown and glitch, shown to everyone; minigames close and reset
  - Phantom: "Place fake task" mode with a crosshair and validity tint (green or red from the client-side check; the server is authoritative), confirm; fake pins shown on the Phantom's map with an assigned state
  - Fooled overlay: "You got fooled by a fake task!" with a ghost illustration (inline SVG), dismissable after 2 s
- [ ] **09.7 Bots v5:** imposter bots use Task Stop whenever it is ready, and plant fakes at random valid points.
- [ ] **09.8 Integration and E2E:** a Phantom plants a fake → the next crew refill gets it → the crew player completes it → the fooled overlay appears and the team score doesn't change. Task Stop resets a crew player's open minigame and blocks submissions for 30 s.
- [ ] **09.9 Wrap up.** Update the docs. Commit, tag, push.

## Acceptance criteria
- Both abilities follow RULES exactly. Cooldowns freeze correctly in meetings, pauses and out of bounds.
- Fakes can't be told apart from real tasks before completion (leak test) and never add points.
- `all` mode works for Saboteur and Phantom.

## Verification
```
pnpm verify && pnpm e2e
```
A bot game with ability-using imposters.

## Manual steps for the human
None.

## Docs to update
PROTOCOL.md, RULES.md/TASKS.md (if clarified), PROGRESS.md, DECISIONS.md.
