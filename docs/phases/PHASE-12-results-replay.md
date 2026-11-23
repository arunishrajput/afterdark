# Phase 12: End Game, Results and Replay

**Goal:** a satisfying end-of-game experience: a winner banner with the reason, a full reveal (roles, classes, tags), the infection timeline, meeting history, the leaderboard and awards. The host can start a rematch with the same setup, and can end the game early.

**Depends on:** Phase 11.

**Read first:**
- [SCORING.md › End-of-game awards](../SCORING.md#end-of-game-awards-results-screen)
- [RULES.md §11–12](../RULES.md)
- [ROLES.md](../ROLES.md) (results row of the visibility matrix)
- [UI_UX.md](../UI_UX.md) (Results)
- [PROTOCOL.md](../PROTOCOL.md) (`results`, `lobby:playAgain`)

**Skills to use:** `frontend-ui-engineering`, `dataviz` (the timeline and score chart), `animate`.

## Scope
- **In:** a server event log, the `ResultsView` projection (sent only once the game has ended), the results UI, Play again, end early, and a small "share result" text (optional).
- **Out:** any persistence across server restarts.

## Tasks
- [x] **12.1 Event log:** the engine appends `{at (game time + wall time), type, actors, data}` for the key events: roles assigned, task completed (player, type, points), fooled, Task Stop, fake planted, camouflage used, infection channel completed (imposter → target), infected, meeting called, votes (counts plus the ejection), zone penalties, pause, end. The log stays on the server until the game ends.
- [x] **12.2 `ResultsView`:**
  - winner and reason (V1–V6)
  - final team score and target
  - compromised count and threshold
  - per player: username, role, class(es), tag, personal score, tasks done, distance walked (sum of accepted fix deltas, rounded), infections caused (imposters), whether infected and when, meetings called, ejected?
  - infection timeline (imposter → target, at time)
  - meetings (caller, outcome, tallies; never per-voter choices)
  - team score over time, sampled every 30 s of game time
  - awards: crew MVP, top infector, most fooled

  Only sent when `phase === 'ended'`. Leak test: before the end, no `results` key and none of these fields anywhere.
- [x] **12.3 Play again:** host only, from `ended`. Back to `lobby` with the same map, setup and config. Everyone un-readied. Per-game state cleared (tasks, roles, tags, scores, log). Spectators back to active. Disconnected players are dropped only if they've been gone for more than 5 min. Tests.
- [x] **12.4 End early:** `game:abort` already exists; add a confirm dialog in the host menu, and results showing "Aborted by host" with the partial stats.
- [x] **12.5 Results UI:** neutral theme.
  1. A big winner banner (crew blue or imposter red glow) with the reason line.
  2. A "Who was who" grid of cards with username → role, class and tag, flipping in one by one.
  3. A timeline (a vertical list with icons; an optional small inline SVG score chart).
  4. Leaderboard and awards.
  5. Meeting history.
  6. Buttons: Play again (host) or "Waiting for host…", and Leave.
- [x] **12.6 Optional share result:** the Web Share API with a short text summary (no images).
- [x] **12.7 Tests and E2E:** the integration test checks the ResultsView contents after a scripted game. The e2e test covers bots + 1 player → a crew win → the results screen → Play again → back in the lobby with the same boundary.
- [x] **12.8 Wrap up.** Update the docs. Commit, tag, push.

## Acceptance criteria
- The results screen accurately reflects the game (checked against the scripted game). No hidden data leaks before the game ends.
- Play again returns everyone to a clean lobby with the setup kept.
- Ending early works and shows "Aborted".

## Verification
```
pnpm verify && pnpm e2e
```
Use the Playwright MCP to screenshot the results screen.

## Manual steps for the human
None.

## Docs to update
PROTOCOL.md, SCORING.md (if the awards changed), PROGRESS.md.
