# AfterDark: Official Rules

**This is the authoritative rule book.** If code, UI or another doc disagrees with it, this file wins until it is deliberately changed and the change is recorded in [DECISIONS.md](DECISIONS.md).

Numbers appear as `configKey` (default). All values live in [CONFIG.md](CONFIG.md). Roles and visibility are in [ROLES.md](ROLES.md), points in [SCORING.md](SCORING.md), meetings in [MEETINGS.md](MEETINGS.md), and the map system in [MAP_AND_REGIONS.md](MAP_AND_REGIONS.md).

Rules version: **1.0** (2026-11-23)

---

## 1. Fairness principles (non-negotiable)
1. **The server is authoritative.** Roles, tags, classes, task assignment, task authenticity, infection, cooldowns, votes and win checks all live on the server. Clients only display.
2. **Need to know.** A client only receives data its player is entitled to see. No hidden value is ever sent to an unauthorised client, not even hidden in the UI (see the visibility matrix in [ROLES.md](ROLES.md#visibility-matrix)).
3. **All randomness happens on the server** with a seeded RNG, so games can be replayed in tests.
4. **The host has no advantage.** After the game starts, the host is an ordinary player who sees no hidden information. Host-only actions are pause, abort, force start (spawn phase only) and play again.
5. **Penalties are symmetric and leak-free.** No penalty may affect a public number differently depending on a secret role.
6. **No client trust.** Minigame answers are checked on the server. Positions are checked for plausibility. Every inbound message is validated against a schema.
7. **There is no kill mechanic, no in-app chat and no room scanning.** Imposters infect; they never eliminate. All talking happens face to face.

## 2. Glossary
| Term | Meaning |
|---|---|
| **Crew** | Normal players (blue theme). They win through tasks or by ejecting every imposter. |
| **Imposter** | Secret infiltrators (red theme). They win by compromising enough crew. |
| **Class** | An imposter's secret special ability: **Saboteur**, **Phantom** or **Camouflage**. |
| **Tag** | A secret, unique in-game identity that is easy to say aloud, such as `RAVEN-07`. Used for co-op tasks. |
| **Exposed** | A crew member hit by a completed infection channel who is still incubating. Only imposters know. |
| **Infected** | A crew member whose incubation has finished. Permanent and secret. |
| **Compromised** | A unique crew member who is infected **or** was wrongly ejected. This counts toward the imposter win. |
| **Spectator** | An ejected player. Sees public information only. |
| **Region / Section** | A named part of the play area, and one of its 9 local compass sections (N, NE, E, SE, S, SW, W, NW, Centre). |
| **Base** | The meeting point the host places during setup. |
| **Task point** | A candidate location where a task can be placed. |
| **Game time** | The match clock. It stops during meetings and host pauses. |

## 3. Lobby
1. One player **creates** a lobby and becomes host. They get a `lobbyCodeLength` (6) character code and a share link `/?code=XXXXXX`.
2. To **join**, a player needs the code and a username (`usernameMinLen`–`usernameMaxLen` (2–16) characters, unique in the lobby, case-insensitive). They must also **accept the safety notice**: play in safe public places, watch for traffic, stop before using the phone, and never trespass.
3. A lobby holds `minPlayers`–`maxPlayers` (4–12) players. Joining is closed once a game starts; disconnected players can still reconnect.
4. The host sets up the **playable area**, the **regions**, the **task points**, any **no-go zones**, the **Base** and the **settings** (see [MAP_AND_REGIONS.md](MAP_AND_REGIONS.md)). The lobby map shows this setup to everyone.
5. **Ready** requires location permission and a fresh fix (accuracy ≤ `maxAccuracyM` (30 m)). Players do not need to be inside the boundary yet.
6. **Any config or map change un-readies everyone**, so nobody is committed to rules they did not see.
7. When **every** player is ready, there are at least 4 players, and the config is valid (boundary set, Base set, enough usable task points), a `startCountdownS` (5 s) countdown begins. Anyone un-readying cancels it.
8. **If the host leaves the lobby,** host status passes to the earliest-joined connected player. The host can kick a player; a kicked player's session cannot rejoin that lobby.
9. A lobby with nobody connected is deleted after `lobbyIdleTimeoutMin` (30 min).

## 4. Spawn phase
1. When the countdown ends, the server gives every player their own **spawn point** inside the boundary and outside no-go zones. Spawns are spread as far apart as possible, never closer than `spawnMinSeparationM` (40 m), and assigned so total walking is low.
2. Each phone shows only **its own** spawn: a pin, the distance and a direction arrow. Nobody has a role yet.
3. A player has **reached** their spawn when a good fix places them within `reachRadiusM` (15 m).
4. Roles are assigned when **everyone has reached their spawn**, or `spawnTimeoutS` (300 s) has passed, or the **host forces the start**, whichever comes first. A player who hasn't reached their spawn still gets a role.
5. Spawns are spread apart so nobody can see another person's screen when roles are revealed.

## 5. Roles and reveal
1. **Imposter count** is set by `imposterCount` (auto: 4–5 players → 1, 6–9 → 2, 10–12 → 3), and at least 3 crew must remain.
2. Every player receives a unique secret **tag**.
3. In `classes` mode, each imposter gets one **class**, drawn without repeats from Saboteur, Phantom and Camouflage. In `all` mode, every imposter has all three. Every imposter also has **Infect**.
4. **Imposters know each other's username and tag.** Crew know nothing about other players' roles.
5. **Reveal:** players see a full-screen card they must **press and hold** to read: role, tag and (for imposters) class and allies. From here on, the crew theme is **blue** and the imposter theme is **red**. After `roleRevealS` (10 s), play begins and the match clock starts.

## 6. Playing: crew
1. Each active crew member always holds `taskSlots` (3) tasks. A task leaves a slot when it is completed, expires, is rerolled or is reported, and the slot refills straight away.
2. **Three-stage reveal** (details in [TASKS.md](TASKS.md)):
   - **Stage 1, direction:** "Go to **North-East of Region A**". That section is highlighted on the map.
   - **Stage 2, pin:** the exact point is revealed after the server confirms the player stayed inside that section for `sectionEntryHoldS` (3 s) with a good fix.
   - **Stage 3, minigame:** within `reachRadiusM` (15 m) of the pin, the player can open the task and see its type and points.
3. Minigames are checked on the server. A wrong answer causes a `taskWrongLockoutS` (3 s) wait, then the player can retry. Walking further than `reachRadiusM + taskAbandonExtraM` (25 m) from the pin cancels the minigame in progress.
4. Before a minigame opens, the client shows **"Stop somewhere safe"**.
5. **Reroll:** one task can be swapped for a new one every `rerollCooldownS` (180 s).
6. **Report unsafe point:** this removes the point from the pool for this game and replaces the task. It has no cooldown, but reports are logged.
7. **Co-op tasks** (`coopChance` 25% of new tasks) pair the player with a partner drawn from **all** active players, so the partner may be an imposter. Both players see "Find **`<partner tag>`** at **`<section>`**". The task completes when both players are at the pin and finish the co-op minigame. It expires after `coopExpiryS` (360 s of game time) with a neutral "Co-op task expired" message. Full rules are in [TASKS.md](TASKS.md#5-co-op-tasks).
8. Tasks never run out. Crew keep earning until a win condition is met.

## 7. Playing: imposters
Imposters have no solo tasks. They hold the co-op tasks they are drawn into as partners, which lets them blend in. Every ability has `abilityInitialCooldownS` (60 s) of cooldown when play starts.

### 7.1 Infect (every imposter)
1. The Infect button is enabled when a **healthy, active, non-imposter** player has a good fix within `infectionRadiusM` (8 m) of the imposter, the imposter is inside the boundary, and Infect is not on cooldown or blocked by a meeting.
2. Tapping Infect starts a **channel** on the nearest eligible target. Imposter and target must stay within range for `infectionChannelS` (10 s). Out-of-range or stale gaps of up to `infectionGapToleranceS` (3 s) are tolerated; longer gaps fail the channel. Infect does not go on cooldown when a channel fails.
3. When the channel completes, the target becomes **Exposed**. **Incubation** (`incubationS`, 60 s of game time) starts once the imposter has been out of range for 3 s. A stale imposter fix counts as out of range. When incubation ends, the target is **Infected**, and the compromised count and infection boxes go up.
4. After every **successful** channel, that imposter's Infect has a cooldown of `infectionCooldownS` (60 s).
5. Infection is permanent. It does not spread from infected players. Each crew member can be compromised only once. Imposters can't infect imposters or spectators.
6. **Infected players are never told.** Their view is identical to a healthy crew member's, and their task points still count.
7. While a meeting is running, and for `postMeetingGraceS` (30 s) afterwards, Infect is disabled and any channel in progress is cancelled. Incubation timers pause during meetings because they run on game time.

### 7.2 Saboteur: Task Stop
Cooldown `taskStopCooldownS` (120 s). When activated:
- every minigame in progress, solo or co-op, resets to its start
- **nobody can open or submit a task** for `taskStopLockS` (30 s)
- everyone sees a "SYSTEMS JAMMED" banner with a countdown

It cannot be activated while a lock is already active, during a meeting, or while the Saboteur is out of bounds. Stage 1 and 2 reveals and key pickups already completed are kept.

### 7.3 Phantom: Fake Task
Cooldown `fakeTaskCooldownS` (120 s).
- The Phantom pins a point inside the boundary, outside no-go zones, and at least `fakeTaskMinDistanceM` (30 m) from other task points and fakes.
- The fake goes into a **queue**. The next crew slot that refills gets it instead of a real task. Which player gets it depends on who finishes a task next, so it is effectively random.
- A fake task always uses a random solo minigame other than key fetch, and its region and section are worked out from the pinned point.
- Its payload looks exactly like a real task's. Completing it shows **"You got fooled by a fake task!"** and awards **0 points**. Rerolling or reporting it removes it.
- A Phantom can have at most `fakeTaskMaxActive` (2) fakes queued or assigned at once.
- The Phantom sees their fake pins and whether each one has been assigned.

### 7.4 Camouflage
Cooldown `camouflageCooldownS` (120 s). Lasts `camouflageDurationS` (45 s).
1. **It changes only the imposter's own screen.** For the duration, the phone shows a convincing **crew** interface: blue theme and decoy task cards. Other players' screens and the server-side identity do not change.
2. While camouflaged, the imposter may **join any co-op task as the partner** when a crew member is waiting at that task's pin and the real partner has not joined. Person A's screen shows the expected partner tag joining.
3. If the imposter completes a co-op task this way, Person A gets credit exactly as normal (see [SCORING.md](SCORING.md)). The real partner's copy closes as "Co-op task expired", which is the same message as an ordinary expiry.
4. If Camouflage would end while the imposter is in a co-op task, it extends until the task finishes, by at most `camouflageCoopExtensionMaxS` (120 s).
5. Infect can be used while camouflaged.

### 7.5 Cooldown recovery through apparent cooperation
When an imposter completes a co-op task with a **crew** partner, whether assigned or joined through Camouflage, the remaining cooldown on their class ability(ies) drops:
- by `coopRecoveryFirst` (50%) the first time with that partner
- by `coopRecoverySecond` (25%) the second time
- by nothing after that

Two imposters can never be paired, because every co-op task belongs to a crew member's slot. Infect's cooldown is not affected.

## 8. Meetings and voting
Full rules are in [MEETINGS.md](MEETINGS.md). In summary:
- Any active player may call `meetingsPerPlayer` (1) emergency meeting per game. None may be called in the first `meetingStartGraceS` (120 s) of play or within `meetingCooldownS` (120 s) after the last meeting.
- The match clock, cooldowns, incubation and co-op expiry all pause. Minigames in progress reset. Infect and abilities are disabled.
- The meeting runs **Gather** at the Base (≤180 s) → **Discuss** face to face (`meetingDiscussS` 90 s) → **Vote** by username or skip (`meetingVoteS` 45 s) → **Result** (8 s).
- The player with the most votes is ejected only if they have more votes than Skip and nobody ties with them. An ejection always reveals **Imposter / Not an imposter**, and never reveals infection.
- **Wrongly ejecting a crew member compromises that player.** Ejected players become spectators.

## 9. Zone (boundary)
1. A player is **out of bounds** when a good fix places them outside the boundary or inside a no-go zone. Every client sees that player's dot flagged.
2. The player gets a warning straight away. After `zoneGraceS` (15 s), they lose `zonePenaltyPoints` (1) **personal** point every `zonePenaltyIntervalS` (10 s) until they return.
3. While out of bounds, crew cannot open or submit tasks, and imposters cannot Infect or use abilities. Imposter ability cooldowns stop counting down.
4. Zone penalties **never** change the team score, so they cannot reveal anyone's role.

## 10. Connectivity
1. The app asks for a **Screen Wake Lock** and tells players to keep it open. Browsers stop GPS when the screen locks.
2. A player whose last fix is older than `staleAfterS` (10 s) is **stale**. They can't reveal, reach, open or submit tasks, Infect or be infected. Their dot is shown as a faded "signal lost" marker.
3. Fixes with accuracy worse than `maxAccuracyM` (30 m) are kept for display but ignored by game rules. The UI shows "Weak GPS".
4. A fix that implies a speed above `maxSpeedMps` (12 m/s) is rejected. After 3 consecutive fixes that agree with each other, the player is re-anchored to the new location.
5. **Reconnect:** each player has a session token stored on the device. Reconnecting at any point restores the same player, role and tasks. Players are never removed for disconnecting.
6. **Forfeit:** if every active imposter, or every active crew member, has been disconnected for `forfeitAfterS` (180 s), the other side wins.

## 11. Host controls
- **Before the game:** settings, map setup, kick.
- **During the game:**
  - **Pause / Resume.** Game time stops; nothing can be done while paused.
  - **Force start**, during the spawn phase only.
  - **Abort**, which ends the game with no winner.
- **After the game:** **Play again**, which returns everyone to the lobby with the same map and settings, all un-readied.

## 12. Victory
The server checks win conditions after **every** state change, in strict processing order. The first condition met ends the game.

| # | Condition | Winner |
|---|---|---|
| V1 | Team score ≥ `targetScore` (100) | **Crew** |
| V2 | Every imposter has been ejected | **Crew** |
| V3 | Compromised ≥ `ceil(infectionWinPercent/100 × originalCrewCount)` (60%) | **Imposters** |
| V4 | Match clock reaches `playTimeMin` (25 min) | Compare progress: crew `min(1, teamScore/targetScore)` vs imposters `min(1, compromised/threshold)`. Higher wins; equal is a **Draw**. |
| V5 | Forfeit (§10.6) | The side that is still connected |
| V6 | Host aborts | No result |

`originalCrewCount` is fixed when roles are assigned and never changes, even if players disconnect or are ejected.

## 13. Edge cases (resolved)
| # | Situation | Resolution |
|---|---|---|
| E1 | Player never reaches their spawn | The spawn timeout or host force start assigns roles anyway. |
| E2 | Player disconnects during spawn | Same as E1. They reconnect into the reveal or the game. |
| E3 | Boundary too small to separate spawns | The generator relaxes separation down to 40 m. If that still fails, the lobby setup is invalid and the host is told to enlarge the area. |
| E4 | Task point turns out to be unreachable | Reroll it (cooldown) or report it as unsafe (no cooldown). |
| E5 | Weak GPS (>30 m) near a pin | Can't reveal or open until accuracy improves. The UI explains why. |
| E6 | Two imposters channel on the same target | The first channel to complete exposes the target. The other is cancelled and its imposter goes on no cooldown. |
| E7 | Imposter tries to infect another imposter, a spectator or an already compromised player | Not an eligible target. The button ignores them. |
| E8 | Imposter stays next to an exposed target indefinitely | Incubation doesn't start until the imposter leaves. That is the imposter's choice. |
| E9 | Game ends while someone is still incubating | That exposure doesn't count. |
| E10 | Infected crew member completes tasks | Points count normally. They are never told. |
| E11 | Task Stop while a player is on a minigame's final step | The minigame resets. Any submission during the lock is rejected with "Systems jammed". |
| E12 | Task Stop pressed while a lock is already active | The button is disabled. |
| E13 | Fake pin placed outside the boundary or in a no-go zone | Rejected. No cooldown is used. |
| E14 | Fake queue is full (2 active for that Phantom) | The button is disabled until a fake is completed or removed. |
| E15 | Nobody refills a slot for a long time | The fake stays queued until someone does. |
| E16 | Fake task rerolled or reported | It is removed. The Phantom's slot is freed. |
| E17 | Co-op partner is an imposter (assigned) | The task completes normally. Crediting is in SCORING. The imposter gets cooldown recovery. |
| E18 | Real partner and a camouflaged imposter both arrive | Whoever joins first is the partner. Once anyone has joined, the slot is closed. |
| E19 | Camouflage ends mid co-op | It extends until the task ends (max 120 s). |
| E20 | Co-op partner is ejected or abandons the game | The task expires for the other player, who gets a new one. |
| E21 | Co-op partner becomes infected | No effect on the task. |
| E22 | Meeting called during an infection channel or minigame | Both are cancelled or reset. Incubation pauses. |
| E23 | Meeting called during a Task Stop lock | The lock's remaining time is frozen and continues after the meeting. |
| E24 | Players can't all reach the Base | Discussion starts after the 180 s gather timeout. Voting doesn't require being at the Base. |
| E25 | Vote tie, or Skip ≥ top votes | Nobody is ejected. |
| E26 | Already-infected crew member is ejected | They are already compromised, so the count doesn't change. The reveal says "Not an imposter". |
| E27 | Last imposter ejected | Crew win immediately (V2). |
| E28 | Ejection pushes compromised to the threshold | Imposters win immediately (V3). |
| E29 | Team target and infection threshold reached by different events at almost the same time | Whichever event the server processes first wins. Order is strict. |
| E30 | Both progress ratios equal at time-up | Draw. |
| E31 | Host disconnects mid-game | The game continues. Host controls pass to the earliest-joined connected player. |
| E32 | Player out of bounds when a meeting is called | Zone penalties pause during the meeting. Gathering at the Base is inside the area by construction. |
| E33 | GPS teleport or spoof jump | The fix is rejected (speed check). The player re-anchors after 3 consistent fixes. Repeated jumps are logged. |
| E34 | Late joiner tries to join mid-game | Rejected with "Game in progress". |
| E35 | Duplicate username | Rejected with a message. |
| E36 | Phone locks or browser goes to background | The player becomes stale. They can't act or be infected until they return. The app re-acquires the wake lock. |
| E37 | Imposter disconnects | Their abilities stop being usable. Forfeit applies if every active imposter has been gone 180 s. |
| E38 | Spectator talks during a meeting | It can't be prevented physically. Spectators only receive public data, so they can't leak anything secret through the app. |
| E39 | All players ready but no Base or no usable task points | The countdown doesn't start. The lobby shows exactly what is missing. |
| E40 | Host changes settings after everyone is ready | Everyone is un-readied (§3.6). |
