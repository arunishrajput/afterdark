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
| `spawnAttempts` | 8 | — | 🔒 | Spawn layouts the server draws; the one with the largest minimum distance between spawns is kept (RULES §4, ADR-050). |
| `roleRevealS` | 10 | — | 🔒 | Length of the hold-to-reveal screen before play begins. |
| `lobbyIdleTimeoutMin` | 30 | — | 🔒 | A lobby with no connected players is deleted after this. |
| `lobbyIdleSweepS` | 60 | — | 🔒 | How often the server looks for idle lobbies to delete. |
| `hostDisconnectGraceS` | 30 | — | 🔒 | In the lobby and in a running game (E31), a host disconnected this long hands host status to the earliest-joined connected human (ADR-036, ADR-057). |

## Map, regions and visibility
| Key | Default | Range | Host | Notes |
|---|---|---|---|---|
| `minBoundaryAreaM2` | 15000 | — | 🔒 | Roughly a circle of 70 m radius. |
| `maxBoundaryAreaM2` | 3000000 | — | 🔒 | 3 km². |
| `regionCount` | `auto` | auto, 2–6 | ✅ | auto by boundary area: under 40k m² → 2, under 150k → 3, under 400k → 4, under 1M → 5, otherwise 6. |
| `regionCountAutoMaxAreaM2` | `[40000, 150000, 400000, 1000000]` | — | 🔒 | The `auto` rule above, as data: region count = 2 + number of thresholds the area meets or exceeds. |
| `regionSampleCount` | 400 | — | 🔒 | Random points sampled in the playable area to run k-means on when splitting it into regions. |
| `regionKmeansIterations` | 20 | — | 🔒 | k-means iterations for the region split. |
| `minRegionAreaRatio` | 0.1 | — | 🔒 | A region smaller than this fraction of the average region is dropped, and the split re-runs with one region fewer. |
| `regionNameMaxLen` | 20 | — | 🔒 | Longest region name the host can type (in characters). |
| `sectionCentreRatio` | 0.35 | — | 🔒 | The Centre section is the inner 35% of the region's radius. |
| `minSectionAreaM2` | 400 | — | 🔒 | Smaller sections get no tasks. |
| `taskPointsPerSection` | 3 | — | 🔒 | Target number of auto-generated candidate points per section. |
| `taskPointMinSpacingM` | 20 | — | 🔒 | Minimum distance between candidate points. |
| `minTaskPointsPerPlayer` | 4 | — | 🔒 | Setup is valid only with at least this many usable task points per player. |
| `minRegionsWithPoints` | 2 | — | 🔒 | ...and the usable points must be spread over at least this many regions. |
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
| `futureFixToleranceS` | 5 | — | 🔒 | A fix timestamped further ahead of the server clock than this is rejected. |
| `speedCheckMinDtS` | 1 | — | 🔒 | The speed check divides by at least this many seconds, so two fixes a few ms apart can't fake a huge speed. |
| `teleportAccuracyM` | 5 | — | 🔒 | Accuracy given to a `dev:teleport` fix (test mode only). |
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
| `taskMinDistanceM` | 60 | — | 🔒 | A new task's pin is picked at least this far from the player when a point that far exists (MAP §4). |
| `minigamesEnabled` | `['wires','lock']` | — | 🔒 | Types a solo task can roll. Grows as minigames ship (Phase 11 adds the rest). |
| `minigameWeights` | wires 3, lock 3, pattern 3, signal 2, slide 2, crossword 2, keyfetch 1 | — | 🔒 | Relative chance of each type among the enabled ones (TASKS §2). |
| `wiresPairs` | 4 | 3–6 | 🔒 | Wires per side in Wire Connect. |
| `lockDigits` | 3 | 3–5 | 🔒 | Length of the Lock Breaker code. |
| `lockDigitMax` | 5 | 3–9 | 🔒 | Highest digit used (digits run 0 to this). |
| `lockMaxGuesses` | 8 | — | 🔒 | Guesses before the lock re-rolls its code. |

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
| `incubationDepartS` | 3 | — | 🔒 | How long the exposing imposter must stay out of range (or stale) before incubation starts (RULES §7.1.3). |
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
| `clockSyncSamples` | 5 | — | 🔒 | `time:ping` round trips per clock sync; the lowest-RTT sample sets the offset. |
| `clockSyncIntervalMs` | 30000 | — | 🔒 | How often the client re-syncs its server-clock offset. |
| `ackTimeoutMs` | 5000 | — | 🔒 | Client gives up waiting for an ack after this. |
| `tickIntervalMs` | 1000 | — | 🔒 | Server room tick (countdowns, timers, win checks). |
| `socketEventsPerSecond` | 10 | — | 🔒 | Basic per-socket rate limit for client → server events; extra events get `RATE_LIMITED`. |
| `locEventsPerSecond` | 2 | — | 🔒 | Separate per-socket limit for `loc:update` (which has no ack): extra fixes are dropped silently. It does not count against `socketEventsPerSecond`. |
| `shutdownNoticeMs` | 1500 | — | 🔒 | On SIGTERM the server sends `server:shutdown` to every client and waits this long before closing, so phones can show "restarting" instead of an error. |
| `slowCommandMs` | 50 | — | 🔒 | A command or room tick slower than this is logged at `warn` (with room code, command type and duration, never coordinates). |

## Bots (test mode)
Used by the bot CLI and the in-process bots from `dev:addBots` (TESTING §5, ADR-056).

| Key | Default | Range | Host | Notes |
|---|---|---|---|---|
| `botSpeedMps` | 1.4 | — | 🔒 | Walking speed. |
| `botJitterM` | 3 | — | 🔒 | GPS noise added to each bot fix (± this many metres). |
| `botStepS` | 1 | — | 🔒 | Seconds between bot position updates. |
| `botWanderLegM` | 60 | — | 🔒 | Longest random leg a bot walks while wandering. |
| `botTaskMinS` | 10 | — | 🔒 | A crew bot at its pin waits at least this long (game-free real seconds) before finishing the task. |
| `botTaskMaxS` | 30 | — | 🔒 | …and at most this long. |
