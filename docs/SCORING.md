# Scoring and Win Math

All numbers come from [CONFIG.md](CONFIG.md). The rules they belong to are in [RULES.md](RULES.md#12-victory).

## Two kinds of score
| Score | What it counts | Can it go down? | Who sees it |
|---|---|---|---|
| **Team score** | Sum of genuine task points from completed tasks (see co-op crediting below) | **Never** | Everyone, live |
| **Personal score** | That player's task credit minus zone penalties (floor −∞, no limit) | Yes, through zone penalties | Only that player during the game; everyone on the results screen |

Why penalties never touch the team score: a public number that dropped when crew left the zone but not when imposters did would reveal roles. See ADR-012 in [DECISIONS.md](DECISIONS.md).

## Task points
| Minigame | Key | Points | Typical time at the pin | Notes |
|---|---|---|---|---|
| Wire Connect | `wires` | 4 | 20–40 s | Easy |
| Lock Breaker | `lock` | 5 | 30–60 s | Deduction |
| Pattern Memory | `pattern` | 5 | 20–40 s | Memory |
| Signal Decode | `signal` | 6 | 30–60 s | Decoding |
| Sliding Puzzle | `slide` | 7 | 45–90 s | 3×3 |
| Mini Crossword | `crossword` | 8 | 60–120 s | 3×3 or 4×4 |
| Key Fetch | `keyfetch` | 12 | two points, ≥60 m apart | Walking-heavy |
| Co-op PIN Relay | `coop_pin` | 12 | 30–60 s | 6 personal credit each; full 12 to the team |
| Fake (Phantom) | `fake` | 0 | any solo game | Shows "You got fooled by a fake task!" |

Points are fixed per minigame type, not by distance. Key Fetch makes up for its extra walking with a higher value.

## Co-op crediting
The rule: **a completed co-op task adds its full value to the team score, whoever the partner was.**

| Partner | Team score | Crew participant's personal score | Imposter participant |
|---|---|---|---|
| Crew + crew | +12 | +6 each | — |
| Crew + imposter (assigned partner) | +12 | +6 | +0 points, plus cooldown recovery (50% / 25% / 0) |
| Crew + camouflaged imposter (fake partner) | +12 | +6 | +0 points, plus cooldown recovery. The real partner's copy closes as "expired" with +0. |
| Imposter + imposter | impossible | — | Co-op pairing always includes at least one crew member as task owner |

Why the full value always goes to the team: if an imposter partner added only half, the crew member would see the team score rise by 6 instead of 12 and know their partner was an imposter. The creator confirmed that a fake co-op should give Person A points normally (ADR-005).

## Fake tasks
These award 0 to the team and 0 personally. The time spent is the cost. They never count toward any total, even if opened or partly played.

## Zone penalties
After `zoneGraceS` (15 s) outside, a player loses `zonePenaltyPoints` (1) personal point every `zonePenaltyIntervalS` (10 s). They never affect the team score.

## Win math
`originalCrewCount` is fixed when roles are assigned.

**Imposter threshold** = `ceil(infectionWinPercent / 100 × originalCrewCount)`, with `infectionWinPercent` = 80 (tuned in Phase 11, ADR-094; it was 60).

| Players | Imposters (auto) | Crew | Compromised needed | Suggested target (22 × crew) |
|---|---|---|---|---|
| 4 | 1 | 3 | 3 | 66 |
| 5 | 1 | 4 | 4 | 88 |
| 6 | 2 | 4 | 4 | 88 |
| 7 | 2 | 5 | 4 | 110 |
| 8 | 2 | 6 | **5** | 132 → default **130** |
| 9 | 2 | 7 | 6 | 154 |
| 10 | 3 | 7 | 6 | 154 |
| 12 | 3 | 9 | 8 | 198 |

The default `targetScore` is 130. The host settings screen shows the suggested target as a hint. The simulation numbers behind these defaults are in [DECISIONS.md › ADR-094](DECISIONS.md) and PROGRESS.md (Phase 11).

**Compromised** = |unique crew who are infected, after incubation| ∪ |unique crew wrongly ejected|. Each player counts at most once.

### Time-up resolution (V4)
```
crewProgress     = min(1, teamScore / targetScore)
imposterProgress = min(1, compromised / threshold)
winner = crewProgress > imposterProgress ? CREW
       : imposterProgress > crewProgress ? IMPOSTERS
       : DRAW
```
**Example:** 8 players, threshold 5, target 130. At time-up the team score is 91 (0.70) and compromised is 4 (0.80). **Imposters win.** If the team score were 110 (0.85), crew would win.

Use exact rational comparison, not floats: compare `teamScore × threshold` with `compromised × targetScore`.

## End-of-game awards (results screen)
- **Crew MVP:** the highest personal score among crew.
- **Top infector:** the imposter with the most successful infections.
- **Most fooled:** the most fake tasks completed (just for fun).
- Per-player stats: tasks done, points, distance walked (approximate: steps of at least `walkStepM` between good fixes during play, so GPS wobble is not counted), meetings called, infections caused, fake tasks fallen for, and when they were infected. Votes are shown as counts per target in the meeting history, never who voted for whom.
- Awards need a value above zero (nobody gets "Top infector" with no infection). A tie goes to the player who joined the lobby first. A co-op counts as one task for each crew participant.
- The **team score chart** is sampled every `scoreSampleS` (30 s) of game time and ends on the real final score (ADR-095, ADR-096).

## Balance notes (to tune in Phases 11 and 14)
- **Rough pacing at 8 players with no imposter pressure:** 6 crew × ~1 task per 3 min ≈ 2 tasks/min × ~6 points ≈ 12 points/min. That reaches 100 in about 8–9 min of pure tasking. Real play is slower because of walking, wrong answers, Task Stops, fakes and meetings. The Phase 11 balance script (`pnpm bots:simulate`) puts a typical 8-player game at about 15 minutes with the tuned defaults (see ADR-094).
- The imposters' natural pace is one infection per imposter every ~2 min at best (60 s cooldown + 10 s channel + 60 s incubation + finding a target).
- If crew win too often, raise `targetScore` or lower `coopChance`. If imposters win too often, raise `infectionWinPercent` or `infectionCooldownS`.
