# Meetings, Discussion and Voting

The creator asked for these in the second brief, and the design builds on the INFILTR8 proposal. Numbers come from [CONFIG.md](CONFIG.md). The summary rules are in [RULES.md §8](RULES.md#8-meetings-and-voting).

## 1. Purpose
Meetings are the crew's only direct counter to imposters. Crew compare what they've seen in the real world (who walked with whom, who refused to show their screen, who claimed which tag, when the infection boxes went up) and vote someone out. **All discussion is face to face.** There is no in-app chat or voice (ADR-020).

## 2. Calling a meeting
- **Who:** any active, non-spectator player, crew or imposter.
- **Allowance:** `meetingsPerPlayer` (1) per player per game. 0 turns meetings off.
- **Blocked when:**
  - within the first `meetingStartGraceS` (120 s) of play
  - within `meetingCooldownS` (120 s, game time) after the last meeting ended
  - while a meeting is already running
  - while the game is paused
  - while the caller is stale

  A caller who is out of bounds *can* still call.
- **UI:** a dedicated button with a confirm step ("Call emergency meeting? You have 1.").

## 3. Lifecycle
```
CALLED → GATHER (≤ meetingGatherS 180 s) → DISCUSS (meetingDiscussS 90 s) → VOTE (meetingVoteS 45 s) → RESULT (meetingResultS 8 s) → resume
```
| Stage | What happens | Ends when |
|---|---|---|
| **Called** (instant) | Every phone shows a full-screen alarm with vibration: "**`<username>`** called a meeting. Go to the Base." Every minigame in progress resets, and every infection channel is cancelled. | Immediately becomes Gather |
| **Gather** | Map shows the Base and the distance to it. The roster shows who has arrived (within `baseRadiusM`, 30 m). | Every active, connected player has arrived, **or** 180 s pass |
| **Discuss** | Countdown screen with the roster: usernames, connection state and spectator marks. No in-app interaction. | 90 s pass, **or** every active player taps "Skip to vote" |
| **Vote** | Every active player picks one username or **Skip**, and confirms. A vote can't be changed once confirmed. A missing vote counts as Skip. Being at the Base is **not** required to vote, so GPS trouble never disenfranchises anyone. | 45 s pass, or everyone has voted |
| **Result** | Tallies per username plus Skip. Never shows who voted for whom. Then the outcome (§4). | 8 s pass |

**While a meeting runs (from Called to the end of Result):**
- **Game time is frozen:** the match clock, ability cooldowns, incubation timers, co-op expiry and Task Stop lock time all stop.
- Task actions, Infect and all abilities are disabled.
- Zone penalties are suspended.
- Reveals keep progressing in the background (section entry, AT_PIN), so walking to the Base isn't wasted.

**After the meeting:** game time resumes. Infect and abilities stay blocked for `postMeetingGraceS` (30 s), so imposters can't strike at the crowded Base. The next meeting can't be called for 120 s.

## 4. Vote resolution
1. Let `top` be the highest vote count among players, and `skip` the Skip count, including non-votes.
2. **Ejected** = the single player with `top` votes, **only if** `top > skip` **and** no other player also has `top` votes.
3. Otherwise **nobody is ejected** ("No one was ejected").
4. **Reveal:** "**`<username>`** was **an Imposter**" or "**`<username>`** was **not an Imposter**". This is always shown (ADR-019). It never reveals their tag, class or infection status.

## 5. Consequences of ejection
| Ejected player was | Effect |
|---|---|
| Imposter | Their abilities are gone. Their fakes still in the queue are removed; fakes already assigned stay as they are. If it was the last active imposter, **Crew win** (V2). |
| Healthy or exposed crew | That player becomes **compromised** (wrongly ejected) and counts toward the imposter threshold. Any exposure is cancelled. If the count reaches the threshold, **Imposters win** (V3). |
| Infected crew | Already compromised, so the count doesn't change. |

Every ejected player becomes a **Spectator** ([ROLES.md](ROLES.md#spectator-)):
- they see public information only
- their own tasks are removed, and co-op tasks they were part of expire for their partner
- points they already earned stay in the team score

## 6. Edge cases
- **Caller disconnects during the meeting:** the meeting carries on.
- **Disconnected players** can't vote; their vote counts as Skip. Whether everyone is gathered is checked only against connected players.
- **Every imposter disconnected** during a meeting: forfeit timing is suspended during meetings and resumes afterwards.
- **Host abort** during a meeting is allowed.
- **Host pause** during a meeting freezes the meeting countdown too.

## 7. UI notes ([UI_UX.md](UI_UX.md))
- The meeting screen uses a **neutral theme** (dark with white accents) for **everyone**, imposters included, so nobody standing in the circle can glance at a screen and see red.
- Big countdown, large roster cards, and a clear "Your vote is locked" state.
- Imposters see no extra information on the meeting screen, which keeps it safe to show your phone in the circle.

## 8. Clarifications from building it (Phase 8, ADR-072 to ADR-077)
- **Calling.** Allowed: any active player with an allowance left. Refusals: `WRONG_PHASE` (not playing), `NOT_ALLOWED` (spectator, meetings off, or the allowance is used), `MEETING_ACTIVE`, `PAUSED`, `COOLDOWN` (the first `meetingStartGraceS`, or `meetingCooldownS` after the last meeting ended, both on game time) and `STALE` (the caller's last fix is stale; a weak fix is fine). The call is the first moment of Gather and stops the game clock with the reason `meeting`.
- **Stage timers use server time** and a host pause pushes them back, so a pause never costs a stage its time. The clock reasons `host` and `meeting` can overlap.
- **Gather.** A player counts as arrived once they have had a good fix within `baseRadiusM` of the Base (sticky). The stage ends when every active **connected** player has arrived, or after `meetingGatherS`. If everyone is already at the Base (a second meeting), Gather ends at once.
- **Discuss and Vote** wait only for active connected players. A vote is for any active player (yourself included) or Skip; it is locked once cast. A non-vote and a vote for someone who can no longer be a candidate count as Skip.
- **Result.** The ejection is applied and revealed when Result **begins**, and the win checks V2 and V3 wait until the meeting has ended (after `meetingResultS`), so the reveal is always shown before a game-ending ejection (ADR-072). The tallies list every active player (zero included) and Skip, sorted by count and then join order, so the order says nothing about who voted. `tallies` never name voters.
- **After a meeting** every imposter's Infect is pushed back to at least `postMeetingGraceS` from now (it shows as the cooldown ring, ADR-073). The forfeit timers are credited the meeting's whole length (MEETINGS §6).
- **Reveals and holds.** Section-entry holds and cooldowns run on game time, so they freeze during a meeting too. A player's position still counts, so walking to the Base is never wasted.
- **Spectators** are out of the game: no dot on anyone's radar, never an Infect target, no tasks, no imposter block (an ejected imposter and the other imposters stop seeing each other as allies). They keep seeing the public HUD and every meeting.
