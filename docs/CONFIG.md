# Game Configuration: Every Tunable Value

This file lists **every number in the game**. Keys are exactly the property names in code (`points.wires` is `config.points.wires`). The code copy lives in `packages/shared/src/config/defaults.ts`, with ranges validated by zod in `packages/shared/src/config/schema.ts`. **Change both together.** Other docs refer to these values by key, for example `infectionRadiusM`. Where they quote a number, it must match this file.

How to read the **Host** column:
- ✅ means the host can change the value in lobby settings.
- ⚙️ means it is under the host's "Advanced" settings.
- 🔒 means it is fixed in code (developers only).

The Phase 11 balance script and the Phase 14 field test may change defaults. Record every change in [DECISIONS.md](DECISIONS.md).

## Match
| Key | Default | Range | Host | Notes |
|---|---|---|---|---|
| `playTimeMin` | 25 | 10–60 | ✅ | Game-time minutes. Pauses during meetings and host pauses. |
| `targetScore` | 100 | 40–300 | ✅ | Team score needed for a crew win. The UI hint suggests `16 × crewCount`. |
| `targetScoreHintPerCrew` | 16 | — | 🔒 | Multiplier for the UI hint `targetScoreHintPerCrew × crewCount`. |
| `minPlayers` | 4 | — | 🔒 | Fewer than this cannot start. |
| `maxPlayers` | 12 | — | 🔒 | Lobby is full at 12. |
| `imposterCount` | `auto` | auto, 1–3 | ✅ | auto: 4–5 players → 1, 6–9 → 2, 10–12 → 3. At least 3 crew must remain. |
| `imposterCountAuto` | `[{maxPlayers:5,count:1},{maxPlayers:9,count:2},{maxPlayers:12,count:3}]` | — | 🔒 | The `auto` rule above, as data: the first entry whose `maxPlayers` ≥ player count wins. |
| `minCrewRemaining` | 3 | — | 🔒 | A manual imposter count that would leave fewer crew than this is invalid. |
| `imposterAbilityMode` | `classes` | classes, all | ✅ | `classes`: one secret class per imposter. `all`: every imposter has all 3 abilities. |
| `playerVisibility` | `nearby` | nearby, regions, all | ✅ | See [MAP_AND_REGIONS.md](MAP_AND_REGIONS.md#6-visibility-modes). |
| `testMode` | false | bool | ✅ | Enables simulated GPS and bots. Shown to everyone as a badge. |

## Lobby and start
| Key | Default | Range | Host | Notes |
|---|---|---|---|---|
| `lobbyCodeLength` | 6 | — | 🔒 | Alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, which leaves out confusable characters. |
| `lobbyCodeAlphabet` | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` | — | 🔒 | 32 symbols (no 0/O, 1/I), so codes are drawn without modulo bias. |
| `usernameMinLen` / `usernameMaxLen` | 2 / 16 | — | 🔒 | Unique per lobby, case-insensitive. |
| `startCountdownS` | 5 | — | 🔒 | Starts when everyone is ready and the config is valid. Cancelled if anyone un-readies. |
| `spawnTimeoutS` | 300 | 60–600 | ⚙️ | Roles are assigned even if not everyone has reached their spawn. |
| `spawnMinSeparationM` | 40 | — | 🔒 | Lower limit only. The generator spreads spawns as far apart as it can. |
| `roleRevealS` | 10 | — | 🔒 | Length of the hold-to-reveal screen before play begins. |
| `lobbyIdleTimeoutMin` | 30 | — | 🔒 | A lobby with no connected players is deleted after this. |

## Map, regions and visibility
| Key | Default | Range | Host | Notes |
|---|---|---|---|---|
| `minBoundaryAreaM2` | 15000 | — | 🔒 | Roughly a circle of 70 m radius. |
| `maxBoundaryAreaM2` | 3000000 | — | 🔒 | 3 km². |
| `regionCount` | `auto` | auto, 2–6 | ✅ | auto by boundary area: under 40k m² → 2, under 150k → 3, under 400k → 4, under 1M → 5, otherwise 6. |
| `regionCountAutoMaxAreaM2` | `[40000, 150000, 400000, 1000000]` | — | 🔒 | The `auto` rule above, as data: region count = 2 + number of thresholds the area meets or exceeds. |
| `sectionCentreRatio` | 0.35 | — | 🔒 | The Centre section is the inner 35% of the region's radius. |
| `minSectionAreaM2` | 400 | — | 🔒 | Smaller sections get no tasks. |
| `taskPointsPerSection` | 3 | — | 🔒 | Target number of auto-generated candidate points per section. |
| `taskPointMinSpacingM` | 20 | — | 🔒 | Minimum distance between candidate points. |
| `baseRadiusM` | 30 | — | 🔒 | A player within this distance of the Base counts as gathered. |
| `nearbyRadiusM` | 40 | 20–100 | ⚙️ | Used by visibility mode `nearby`. |
| `regionCountRefreshS` | 30 | — | 🔒 | Region population counts are bucketed and refreshed this often. |
| `regionCountBuckets` | `0`, `1`, `2–3`, `4+` | — | 🔒 | Stored as `[{min, label}]`: a count gets the label of the last bucket whose `min` it reaches. |
| `dotAliasRotateS` | 300 | — | 🔒 | Anonymous dot IDs change this often. |

## Location quality
| Key | Default | Range | Host | Notes |
|---|---|---|---|---|
| `maxAccuracyM` | 30 | — | 🔒 | A fix less accurate than this cannot reveal, reach, infect or gather. |
| `staleAfterS` | 10 | — | 🔒 | A fix older than this makes the player *stale*. |
| `maxSpeedMps` | 12 | — | 🔒 | A faster jump is rejected. The player re-anchors after 3 consistent fixes. |
| `reanchorFixes` | 3 | — | 🔒 | Consistent fixes needed to re-anchor after a rejected jump. |
| `locationSendIntervalMs` | 1000 | — | 🔒 | Most frequent rate the client sends updates. |
| `locationMinMoveM` | 3 | — | 🔒 | The client also sends an update when it has moved this far. |
| `stationarySendIntervalMs` | 5000 | — | 🔒 | Battery saver used while the player is not moving (Phase 13). |
| `reachRadiusM` | 15 | 8–30 | ⚙️ | Distance to count as at a spawn, a task pin or a co-op point. |
| `sectionEntryHoldS` | 3 | — | 🔒 | Player must stay inside a section this long before its pin is revealed. |

## Zone (boundary)
| Key | Default | Range | Host | Notes |
|---|---|---|---|---|
| `zoneGraceS` | 15 | — | 🔒 | Time outside before penalties start. |
| `zonePenaltyPoints` | 1 | — | 🔒 | **Personal** points lost each interval. Never taken from the team score. |
| `zonePenaltyIntervalS` | 10 | — | 🔒 | |

## Tasks
| Key | Default | Range | Host | Notes |
|---|---|---|---|---|
| `taskSlots` | 3 | — | 🔒 | Active tasks per crew member, always refilled. |
| `coopChance` | 0.25 | 0–0.5 | ⚙️ | Chance that a newly generated task is co-op. |
| `coopExpiryS` | 360 | — | 🔒 | Game time. Pauses during meetings. |
| `rerollCooldownS` | 180 | — | 🔒 | Per player. |
| `taskPointReuseCooldownS` | 300 | — | 🔒 | A candidate point rests this long before it can be reused. |
| `taskWrongLockoutS` | 3 | — | 🔒 | Wait after a wrong submission. |
| `taskAbandonExtraM` | 10 | — | 🔒 | A minigame in progress is cancelled if the player goes further than `reachRadiusM` plus this from the pin. |
| `keyFetchMinLegM` | 60 | — | 🔒 | Minimum distance between the two points of a key-fetch task. |

## Points
Rules: [SCORING.md](SCORING.md).

| Key | Default | Notes |
|---|---|---|
| `points.wires` | 4 | Wire Connect |
| `points.lock` | 5 | Lock Breaker |
| `points.pattern` | 5 | Pattern Memory |
| `points.signal` | 6 | Signal Decode |
| `points.slide` | 7 | Sliding Puzzle |
| `points.crossword` | 8 | Mini Crossword |
| `points.keyfetch` | 12 | Key Fetch (two points) |
| `points.coop_pin` | 12 | Co-op PIN Relay. Full 12 goes to the team; personal credit is 6 each. |
| `points.fake` | 0 | Phantom fake task |
| `coopPersonalPoints` | 6 | Personal credit for each co-op participant. The team always gets `points.coop_pin`. |

## Infection
| Key | Default | Range | Host | Notes |
|---|---|---|---|---|
| `infectionRadiusM` | 8 | 3–15 | ✅ | Confirmed by the creator: lower than this is below what phone GPS can measure. |
| `infectionChannelS` | 10 | 5–30 | ⚙️ | Imposter and target must stay in range this long. |
| `infectionGapToleranceS` | 3 | — | 🔒 | Out-of-range or stale gaps up to this long don't break the channel. |
| `incubationS` | 60 | 0–180 | ⚙️ | Starts when the imposter leaves the target. |
| `infectionCooldownS` | 60 | — | 🔒 | Per imposter, after each *successful* infection. |
| `infectionWinPercent` | 60 | 40–100 | ⚙️ | Win threshold = `ceil(pct/100 × originalCrewCount)`. |

## Imposter abilities
| Key | Default | Range | Host | Notes |
|---|---|---|---|---|
| `abilityInitialCooldownS` | 60 | — | 🔒 | Applies to every ability, including Infect, when play starts. |
| `taskStopCooldownS` | 120 | — | 🔒 | Saboteur |
| `taskStopLockS` | 30 | 10–60 | ⚙️ | All tasks locked. Minigames in progress are reset. |
| `fakeTaskCooldownS` | 120 | — | 🔒 | Phantom |
| `fakeTaskMaxActive` | 2 | — | 🔒 | Per Phantom. Counts both queued and assigned-but-unfinished fakes. |
| `fakeTaskMinDistanceM` | 30 | — | 🔒 | Minimum distance from any other candidate point or fake task. |
| `camouflageCooldownS` | 120 | — | 🔒 | Camouflage |
| `camouflageDurationS` | 45 | — | 🔒 | |
| `camouflageCoopExtensionMaxS` | 120 | — | 🔒 | Most extra time added while the imposter is in a co-op task. |
| `coopRecoveryFirst` | 0.5 | — | 🔒 | Fraction of remaining class cooldown removed after the first co-op with a given crew partner. |
| `coopRecoverySecond` | 0.25 | — | 🔒 | Second co-op with the same partner. After that, nothing. |
| `postMeetingGraceS` | 30 | — | 🔒 | After a meeting: no Infect, no abilities. |

## Meetings
Rules: [MEETINGS.md](MEETINGS.md).

| Key | Default | Range | Host | Notes |
|---|---|---|---|---|
| `meetingsPerPlayer` | 1 | 0–3 | ✅ | 0 turns meetings off. |
| `meetingCooldownS` | 120 | — | 🔒 | Game time after the last meeting ends. |
| `meetingStartGraceS` | 120 | — | 🔒 | No meetings in the first 120 s of play. |
| `meetingGatherS` | 180 | — | 🔒 | Most time allowed to walk to the Base. |
| `meetingDiscussS` | 90 | 30–300 | ✅ | |
| `meetingVoteS` | 45 | 15–120 | ✅ | |
| `meetingResultS` | 8 | — | 🔒 | |

## Connectivity and end
| Key | Default | Range | Host | Notes |
|---|---|---|---|---|
| `forfeitAfterS` | 180 | — | 🔒 | A side with no connected active players for this long loses. |
| `viewThrottleMs` | 200 | — | 🔒 | At most 5 view snapshots per second per player. |
| `radarIntervalMs` | 1000 | — | 🔒 | How often nearby/all dots are sent. |
