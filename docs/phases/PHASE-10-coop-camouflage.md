# Phase 10: Co-op Tasks and Camouflage

**Goal:** co-op tasks pair a crew member with any other player, imposters included, through the partner slot. Both must meet at the pin and complete the PIN Relay. Add crediting rules, expiry and cooldown recovery. **Camouflage** turns only the imposter's own screen into a convincing crew interface, lets them stand in as any waiting co-op partner, and extends through a co-op task.

**Depends on:** Phase 9.

**Read first:**
- [TASKS.md §2, §5](../TASKS.md#5-co-op-tasks)
- [RULES.md §6.7, §7.4, §7.5, §13](../RULES.md) (E17–E21)
- [SCORING.md › Co-op crediting](../SCORING.md#co-op-crediting)
- [ROLES.md](../ROLES.md)
- [UI_UX.md](../UI_UX.md) (Camouflaged imposter, Co-op waiting)
- [PROTOCOL.md](../PROTOCOL.md) (coop events, `ability:camouflage`, `camouflage.decoyTasks`)
- [DECISIONS.md](../DECISIONS.md) ADR-005, 014, 015, 027

**Skills to use:** `test-driven-development`, `doubt-driven-development` (camouflage must not leak or desync), `frontend-ui-engineering`.

## Scope
- **In:** co-op generation and the partner slot, the co-op session state machine, the `coop_pin` minigame, crediting, expiry, partner-gone handling, cooldown recovery, the Camouflage ability (local-only crew look plus stand-in join plus extension), decoy task cards, bots joining co-ops.
- **Out:** extra co-op minigames (optional stretch in Phase 11).

## Tasks
- [x] **10.1 Co-op generation:** enable `coopChance` in refill. The partner is picked uniformly from eligible players: active, connected, not the owner, no current partner task, not already paired with the owner. Fall back to solo. A partner-slot card, for crew and imposters. Tests: imposter partners are possible; nobody ever holds two partner tasks; no pairs of imposters.
- [x] **10.2 Co-op session:**
  - `coop:start` (at the pin) → WAITING
  - `coop:join` by the assigned partner **or a camouflaged imposter** within reach while still WAITING (E18: first to join wins)
  - ACTIVE with the `coop_pin` puzzle: each player is shown the other's PIN
  - `coop:submit` from both
  - COMPLETE
  - leaving reach by more than 10 m sends it back to WAITING
  - Task Stop and meetings reset it to WAITING (with the Phase 8 and 9 hooks)
- [x] **10.3 `coop_pin` minigame:** generate two 4-digit PINs. Each participant's puzzle contains only the PIN they must *show*; the PIN they must *type* comes from the partner in real life. Verify both. Tests.
- [x] **10.4 Crediting and recovery** (SCORING table): the team always gets +12, crew participants +6 personally, imposters +0. If a camouflaged stand-in completed it, the assigned partner's copy closes as `task.expired`. Imposter recovery is `applyRecovery(0.5)` on the first co-op with that crew partner, 0.25 on the second, then 0, tracked per pair. Expiry after `coopExpiryS` (game time; pauses in meetings); a partner ejected or disconnected for more than 180 s → expired (E20). Tests: E17–E21, and the GDD's "A combined task credits each participant once and permits cross-team pairing".
- [x] **10.5 Camouflage ability:**
  - activate: `activeUntil = now + camouflageDurationS`, cooldown `camouflageCooldownS`
  - extension while the imposter is a participant in a WAITING or ACTIVE co-op session, up to `camouflageCoopExtensionMaxS`
  - Infect stays available
  - the server sends `me.imposter.camouflage {until, decoyTasks}`: 3 plausible decoy TaskCards that the server generates (real sections, random stages, never real task IDs)
  - **No other player's view changes at all.** Add a test.
- [x] **10.6 Client, Camouflage:**
  - `data-theme="crew"` on the imposter's device for the duration
  - the full crew HUD with decoy task cards (opening a decoy shows a plausible "Head to the pin" state)
  - a co-op "Join as partner" action appears when the imposter is near a WAITING session
  - imposter-only cues are discreet: a thin top-edge countdown, and long-press on the timer to open the real imposter controls (Infect)
  - the theme snaps back to red when camouflage ends
  - the experience must survive a 3-second glance from another player
- [x] **10.7 Client, co-op:**
  - partner card "Requested by a teammate"
  - co-op task card "Find `<tag>` · NE · Region B"
  - at the pin: Start co-op → "Waiting for `<tag>`…" → the PIN panel (show yours, type theirs) → success
  - "Co-op task expired" toast
- [x] **10.8 Leak tests:**
  - the partner tag appears only in the two participants' cards
  - A's view after a stand-in completion is **identical in structure** to one after a real-partner completion (same events and fields)
  - a camouflaged imposter never changes anyone else's view
  - decoy task IDs never collide with real ones
- [x] **10.9 Bots v6:** crew bots go to their co-op pins and join. Imposter bots with Camouflage sometimes activate it and stand in. An integration scenario covers all three crediting paths.
- [x] **10.10 E2E:** two crew contexts complete a co-op through the UI. An imposter context camouflages (screenshot it: it must look like crew), stands in for a waiting crew player and completes; crew A's screen shows a normal success.
- [x] **10.11 Wrap up.** Update the docs. Commit, tag, push.

## Acceptance criteria
- Co-op works for every partner type, with the correct crediting and no leaks.
- Camouflage is local-only, convincing, extends through co-op, and allows standing in.
- Cooldown recovery applies with diminishing returns per partner.

## Verification
```
pnpm verify && pnpm e2e
```
Use the Playwright MCP to screenshot a crew screen and a camouflaged imposter screen side by side for a visual check.

## Manual steps for the human
Optional field test: does the co-op bluff feel fun? Is the PIN exchange clear?

## Docs to update
TASKS.md, PROTOCOL.md, SCORING.md (if tuned), PROGRESS.md, DECISIONS.md.
