# Phase 07: Infection System and Imposter Win

**Goal:** imposters can infect: an explicit Infect channel within 8 m for 10 s, then exposure, then incubation that starts when the imposter leaves, then infected. Add the per-imposter cooldown, the compromised count, the infection boxes, imposter-only knowledge of who is infected, the imposter win (V3) and full time-up resolution (V4). Crew and infected players must be unable to detect infection in any payload.

**Depends on:** Phase 5 (and Phase 6 deployed, so it auto-deploys).

**Read first:**
- [RULES.md §7.1, §12, §13](../RULES.md) (E6–E10, E29–E30)
- [ROLES.md](../ROLES.md) (Imposter + visibility matrix)
- [SCORING.md › Win math](../SCORING.md#win-math)
- [CONFIG.md › Infection](../CONFIG.md#infection)
- [PROTOCOL.md](../PROTOCOL.md) (`ability:infect`, `me.imposter.infect`, `compromisedIds`, `exposures`, `AnonDot` flags)
- [TESTING.md §3](../TESTING.md#3-leak-tests-mandatory-from-phase-1)
- [DECISIONS.md](../DECISIONS.md) ADR-004, 006, 010, 011

**Skills to use:** `test-driven-development` (lots of timing cases), `doubt-driven-development` (leak paths), `frontend-ui-engineering`.

## Scope
- **In:** the infection system, imposter radar flags (ally, exposed, infected), infection boxes animation, V3, the full V4, the imposter HUD (Infect button and channel ring, infected chip), bot imposters that chase.
- **Out:** meeting interactions (Phase 8 adds the cancellations and the post-meeting grace; leave clean hooks), class abilities (9–10).

## Tasks
- [x] **07.1 Infection system** (`engine/systems/infection.ts`):
  - eligibility: imposter active, in bounds, good fix, Infect off cooldown, not paused, not in a meeting (hook); target healthy, active, non-imposter, good fix, within `infectionRadiusM`
  - `ability:infect` picks the **nearest** eligible target
  - channel: `infectionChannelS` continuous, with `infectionGapToleranceS` tolerance for out-of-range or stale gaps; fails beyond that, with no cooldown
  - on completion: the target is exposed, and the imposter's Infect gets `infectionCooldownS`
  - incubation (game time) starts after the imposter has been out of range for 3 s, or stale
  - infected → compromised++ → `checkVictory` (V3)
  - two imposters on one target (E6): the first to complete wins, and the other channel is cancelled with no cooldown
  - exposures still incubating at game end don't count (E9)
- [x] **07.2 Tests** with a fake clock. Every rule above plus:
  - channel survives a 2 s gap and fails on a 4 s gap
  - incubation doesn't start while the imposter stays near (E8)
  - a stale imposter counts as leaving
  - no re-infection
  - spectators are not eligible
  - V3 thresholds for 4–12 players (the table in SCORING)
  - V4 rational comparison, including a draw
- [x] **07.3 Views:**
  - `me.imposter.infect {readyAt, channel?{endsAt, inRange}}`, `compromisedIds`, `exposures`
  - radar flags `exposed` / `infected` / `ally` for imposters only
  - `game.compromised` for everyone

  The target gets **no** event, vibration or any other signal.
- [x] **07.4 Leak tests** (from TESTING §3): infection invisibility with deep key equality between a healthy and an infected crew view; crew radar flags; a raw frame scan over a scripted game where 3 players get infected. Then the GDD tests: "Crew cannot retrieve infected identities from client data or network responses" and "An infected player receives no notification".
- [x] **07.5 Client, imposter HUD:**
  - Infect button: disabled with the reason (no target, cooldown, out of bounds), enabled with a pulse when a target is in range
  - channel progress ring with an "Stay close" hint and haptics
  - cooldown ring
  - "Infected: n" chip that opens a list of usernames by status
  - map dot styling for ally, exposed and infected
- [x] **07.6 Client, everyone:** infection boxes fill with a glitch animation, a sound, and the toast "Someone has been compromised". Make the threshold notch prominent.
- [x] **07.7 Bots v3:** `--imposter-behaviour chase`: imposter bots walk to the nearest crew bot or human, channel Infect, then walk away. The integration test shows imposters reaching V3 in a bot game. A separate scripted game checks V4 at time-up.
- [x] **07.8 E2E:** a sim-mode imposter context and a crew context. The imposter teleports next to the crew player, channels, walks away, waits for incubation (shorten the config in testMode, or inject the clock through a test hook), and the crew HUD box fills while the crew view shows no infected flag.
- [x] **07.9 Wrap up.** Update the docs (RULES if a clarification was needed, PROTOCOL, PROGRESS). Commit, tag, push. Production auto-deploys; ask the human for an optional field test of infection at real distances.

## Acceptance criteria
- Infection behaves exactly as RULES §7.1 says, with all timing edge cases tested.
- No crew or infected payload reveals infection, as shown by the leak tests and the raw frame scan.
- Imposters win at the threshold. Time-up resolves by progress ratio.
- Bots can produce both crew wins and imposter wins.

## Verification
```
pnpm verify && pnpm e2e
pnpm bots -- --code <CODE> --count 7 --imposter-behaviour chase
```

## Manual steps for the human
Optional field test: does 8 m and 10 s feel right with real GPS? Report your impressions in PROGRESS.md.

## Docs to update
PROTOCOL.md, PROGRESS.md, CONFIG.md and DECISIONS.md (only if tuned).
