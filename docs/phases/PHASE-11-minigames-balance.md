# Phase 11: Remaining Minigames and Balance

**Goal:** complete the catalog with Sliding Puzzle, Mini Crossword, Key Fetch (two points), Pattern Memory and Signal Decode. Then tune the defaults with a headless balance simulation.

**Depends on:** Phase 10.

**Read first:**
- [TASKS.md §3–4, §6](../TASKS.md)
- [SCORING.md](../SCORING.md) (points + balance notes)
- [CONFIG.md](../CONFIG.md) (points, `keyFetchMinLegM`)
- [TESTING.md §5](../TESTING.md#5-bots-toolsbots) (balance script)
- [UI_UX.md](../UI_UX.md) (minigame sheet, accessibility)

**Skills to use:** `test-driven-development`, `frontend-ui-engineering`, `animate` (light motion on success and failure), `performance-optimization` (lazy-load each game).

## Scope
- **In:** 5 minigames (generate, verify, renderer, tests), weighted selection with all types, key-fetch's two-point flow, the balance simulator, default tuning.
- **Out:** a second co-op minigame (optional stretch, only if time remains: `coop_signal`, where each player sees half the decode key).

## Tasks
- [x] **11.1 `slide`:** shuffle the 3×3 grid with 20–30 random legal moves from the solved state. The answer is a move list, replayed on the server. Tests: always solvable, a replayed solution passes, an illegal move fails.
- [x] **11.2 `crossword`:** a bank of ≥ 20 curated 3×3 or 4×4 minis in `shared/minigames/data/crosswords.ts`: original, family-friendly words and clues that Claude writes. Generation picks one; the answer is the grid. Tests: every grid is consistent (the across and down words match their clue lengths, and every letter is used by both directions when the grid is full), no duplicates, the verifier is case-insensitive.
- [x] **11.3 `pattern`:** a 5-step sequence on a 3×3 pad. The client animates it; the answer is the sequence. Tests.
- [x] **11.4 `signal`:** a 4–5 letter word from a curated list, encoded with a symbol substitution. The puzzle includes a partial key (about 60% of the needed symbols); the answer is the word. Tests: always uniquely solvable from the partial key plus the word list. If uniqueness is hard to guarantee, show the missing letters as multiple choice.
- [x] **11.5 `keyfetch`:**
  - Point 1 reached → hold "Pick up key" for 3 s (`task:action`)
  - the server assigns Point 2 in a different section, ≥ `keyFetchMinLegM`, and the card goes back to Stage 1 for Point 2
  - at Point 2, a turn-the-key interaction (3-step rotation sequence shown on the key) → submit
  - the held key survives Task Stop, meetings and reconnects (TASKS §6)
  - never used for fakes
  - tests cover the whole flow
- [x] **11.6 Renderers:** `SlidingPuzzle.tsx`, `MiniCrossword.tsx` (an on-screen letter keyboard so the system keyboard doesn't pop up and shift the layout), `PatternMemory.tsx`, `SignalDecode.tsx`, `KeyFetch.tsx`. Every one is lazy-loaded, accessible (labels, no colour-only cues) and has ≥ 44 px targets. Use the Playwright MCP to screenshot each at 375 px width.
- [x] **11.7 Weighted selection:** the weights from TASKS §2 across all 7 solo types. Add a "Minigame variety" host setting (⚙️), letting the host disable types (at least 2 must stay enabled). Add it to CONFIG.
- [x] **11.8 Balance simulator:** `pnpm bots:simulate --games 50 --players 8 [--config overrides.json]`. Headless, in-process engine with an accelerated injected clock and scripted bot behaviour (walk speeds, task times by type, imposter chase, random meetings). It prints the win rates, the median game length, the split between time-up and early endings, tasks per crew member, and infections per game.
- [x] **11.9 Tune:** run it for 6, 8 and 10 players. The target is roughly 45–55% imposter wins at 8 players, with a median game of 15–22 min. Adjust `targetScore`, `coopChance`, `infectionCooldownS`, `infectionWinPercent` and the points within their documented ranges. Record the before/after table in PROGRESS and an ADR with the new defaults. Update CONFIG and SCORING.
- [x] **11.10 Wrap up.** Update the docs. Commit, tag, push.

## Acceptance criteria
- All 7 solo minigames are playable end to end and checked on the server, with unit and renderer tests.
- Key Fetch's two-point flow works, including its interruptions.
- The balance simulation runs, and the defaults are tuned and documented.

## Verification
```
pnpm verify && pnpm e2e && pnpm bots:simulate --games 50 --players 8
```

## Manual steps for the human
Optional: play each minigame on a phone and say which feel too hard or too easy.

## Docs to update
TASKS.md, SCORING.md, CONFIG.md, DECISIONS.md (tuning ADR), PROGRESS.md.
