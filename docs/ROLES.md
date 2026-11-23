# Roles, Classes and Visibility

Game rules are in [RULES.md](RULES.md). Numbers are in [CONFIG.md](CONFIG.md). The **visibility matrix** below is a security spec: the server's view projection (`apps/server/src/views/`) must enforce it, and the leak tests in [TESTING.md](TESTING.md#3-leak-tests-mandatory-from-phase-1) must prove it.

## Crew 🔵
- **Goal:** reach the team target score, or eject every imposter.
- **Theme:** blue.
- **Has:** 3 task slots, the map, infection boxes, the team score, the match timer, 1 emergency meeting, reroll and report-unsafe.
- **Statuses** (crew are never told):
  - `healthy`
  - `exposed`: channel completed, incubation pending
  - `infected`

  Being exposed or infected changes **nothing** in the player's own view.

## Imposter 🔴
- **Goal:** compromise `ceil(60% × originalCrewCount)` crew members (`infectionWinPercent`). Compromised means infected or wrongly ejected.
- **Theme:** red. While Camouflage is active, the imposter's screen shows a convincing crew-blue interface instead.
- **Has:**
  - Infect
  - one class ability (or all three in `all` mode)
  - co-op tasks they've been drawn into
  - 1 emergency meeting
  - knowledge of the other imposters (username and tag)
  - an infected list (who is exposed and who is infected, whoever caused it)
  - progress of their own channels and incubations
- **Has no solo tasks** and earns no team points of its own (see the co-op crediting in [SCORING.md](SCORING.md)).

### Imposter classes
| Class | Ability | Effect (summary) | Cooldown |
|---|---|---|---|
| **Saboteur** | Task Stop | Resets every minigame in progress and locks all tasks for `taskStopLockS` (30 s) | `taskStopCooldownS` (120 s) |
| **Phantom** | Fake Task | Pins a fake task, which goes to the next crew slot that refills. Completing it awards 0 points and shows "You got fooled by a fake task!" | `fakeTaskCooldownS` (120 s), max 2 active |
| **Camouflage** | Camouflage | Own screen only: crew look for 45 s, and can join any waiting co-op task as the partner | `camouflageCooldownS` (120 s) |

Class assignment is secret. In `classes` mode, classes are drawn without repeats, so with 2 imposters exactly 2 of the 3 classes are in play. Crew never know which ones.

## Spectator 👻
Spectators are ejected players. They see **only public information**: the map with region counts, the team score, the compromised count, the timer, and meeting results. They cannot vote, call meetings, do tasks or be infected. An ejected imposter loses their imposter view entirely, including the infected list and ally information. Points a spectator already earned stay in the team score.

## Host 👑
The host is a lobby role, not a game role. Before the game, the host controls settings, the map setup and kicking. During the game, the host can only pause, resume, force start (spawn phase only) and abort. **The host never receives hidden information because of being host.** If the host leaves, host status passes to the earliest-joined connected player.

## Identities
- **Username:** the real-world name everyone sees in the lobby, the meeting roster and the results.
- **Tag:** secret, unique and easy to say aloud. The format is `WORD-NN`, for example `RAVEN-07`. Words come from a themed list in `packages/shared/src/tags.ts`, and no two players in a game share a word. A player's tag is shown only to that player, to the other imposters if they are an imposter, and as text inside the co-op task card of their partner. Everyone sees all tags on the results screen.

## Visibility matrix
Legend: ✅ visible · ❌ never sent · 🔸 partial (see notes)

| Information | Crew (healthy / exposed / infected, all identical) | Imposter | Spectator | Notes |
|---|---|---|---|---|
| Own username, tag, role | ✅ | ✅ (and own class) | ✅ (role revealed on ejection) | |
| Other players' usernames, connection, ready state | ✅ | ✅ | ✅ | Public roster |
| Other players' tags | 🔸 only the co-op partner's tag, inside the task card | 🔸 the other imposters' tags, and co-op partners' tags | ❌ | |
| Other players' roles | ❌ | 🔸 the other imposters only | ❌ | Ejection reveals Imposter / Not an imposter to everyone |
| Imposter classes in play | ❌ | 🔸 own class, plus the other imposters' classes | ❌ | |
| Other players' positions | 🔸 depends on `playerVisibility`: anonymous dots, no names | 🔸 same mode; dots of exposed and infected players are marked; other imposters' dots are marked | 🔸 same mode | Dots carry no identity. Alias IDs rotate every `dotAliasRotateS` (300 s). |
| Region population counts | ✅ bucketed, every 30 s | ✅ | ✅ | |
| Who is exposed or infected | ❌ | ✅ every infected player, whichever imposter infected them | ❌ | Never sent to crew in any field |
| Own exposed or infected status | ❌ | n/a | ❌ | The view must have the same structure for healthy and infected crew |
| Compromised count, threshold, crew count | ✅ | ✅ | ✅ | Shown as the infection boxes |
| Team score and target | ✅ | ✅ | ✅ | |
| Personal score | 🔸 own only | 🔸 own only | 🔸 own only | Everyone's is shown on the results screen |
| Own task cards | ✅ by stage (direction, then pin, then minigame) | ✅ co-op ones only | ❌ | Later stages are not sent until earned |
| Whether a task is fake | ❌ until "fooled" on completion | 🔸 the Phantom's own fakes | ❌ | Fake and real task payloads must be identical |
| Other players' tasks | ❌ | ❌ | ❌ | |
| Ability cooldowns and states | ❌ | ✅ own; 🔸 the other imposters' cooldowns | ❌ | |
| Active Task Stop lock | ✅ banner and countdown | ✅ | ✅ | It is a public effect |
| Who used an ability | ❌ | 🔸 their own uses | ❌ | |
| Infection channel in progress | ❌ | ✅ own channel's progress | ❌ | The target is **not** notified, and gets no vibration |
| Meeting caller | ✅ username | ✅ | ✅ | |
| Who voted for whom | ❌ | ❌ | ❌ | Only the tallies are shown |
| Everything (roles, tags, classes, infection timeline, votes, scores) | ✅ results screen only | ✅ results screen only | ✅ results screen only | After the game ends |

### Implementation rule
`projectView(state, playerId)` builds each player's view from scratch, using an **allow-list** of fields. Never copy server objects into a view with spread operators. Add a field to a view only when this matrix allows it, and add a leak-test assertion when you do.
