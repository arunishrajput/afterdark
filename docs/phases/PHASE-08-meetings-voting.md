# Phase 08: Meetings, Discussion and Voting

**Goal:** any player can call an emergency meeting. Everyone is pulled to the Base (gather → discuss → vote → result), with game time frozen. Votes can eject a player, with the role reveal. Wrongly ejected crew count as compromised, ejected players become spectators, and ejecting every imposter wins for the crew (V2).

**Depends on:** Phase 7.

**Read first:**
- [MEETINGS.md](../MEETINGS.md) (all of it)
- [RULES.md §8, §12, §13](../RULES.md) (E22–E28, E32, E38)
- [ROLES.md › Spectator](../ROLES.md#spectator-)
- [CONFIG.md › Meetings](../CONFIG.md#meetings)
- [PROTOCOL.md](../PROTOCOL.md) (meeting events, `MeetingView`)
- [UI_UX.md](../UI_UX.md) (Meeting, Spectator)
- [DECISIONS.md](../DECISIONS.md) ADR-018 to ADR-020, ADR-028

**Skills to use:** `test-driven-development`, `frontend-ui-engineering`, `doubt-driven-development` (pause semantics across systems).

## Scope
- **In:** the meeting system, the game-clock pause reason `meeting`, interaction with tasks (reset), infection (cancel channels, post-meeting grace, incubation pause), zone (suspend penalties), co-op expiry (pause hook), V2, the wrong-ejection compromise, spectators, meeting UI, the neutral theme, bot voting.
- **Out:** ability interactions (Phase 9 adds them using the same pause hooks).

## Tasks
- [x] **08.1 Meeting system** (`engine/systems/meetings.ts`):
  - call validation: allowance, start grace, cooldown, not already in a meeting, not paused, caller not stale
  - stages and their timers (gather uses real time and ends on everyone gathered or after 180 s; discuss 90 s or all skip; vote 45 s or all voted; result 8 s)
  - gathering = good fix within `baseRadiusM`, connected players only
  - votes: one per player, locked once cast, missing = Skip
  - tally rule (MEETINGS §4)
  - ejection effects (§5)
  - spectator conversion
  - `GameClock` pause reason `meeting`
- [x] **08.2 Cross-system effects:**
  - meeting start: reset in-progress minigames (tasks), cancel infection channels, suspend zone penalties, freeze co-op expiry (hook), freeze the forfeit timer
  - meeting end: `postMeetingGraceS` blocks Infect (and abilities later); the cooldown starts
  - Phantom fakes in the queue are removed when that Phantom is ejected (hook for Phase 9)
- [x] **08.3 Victory:** V2 (all imposters ejected → crew). The wrong-ejection compromise feeds V3. Tests: E25–E28, plus ejecting an already-infected player leaves the count unchanged.
- [x] **08.4 Views:**
  - `game.meeting: MeetingView {stage, endsAt, calledBy (username), gathered: playerId[], roster: {playerId, username, status, connected}[], myVote?, tallies? (at result), outcome?}`
  - tallies only, never who voted for whom
  - `lobby.players[].revealedRole` for ejected players
  - spectator views follow ROLES (public only; an ejected imposter loses the `imposter` key)

  Leak tests: no vote attribution anywhere; the spectator shape; the meeting view is identical in shape for crew and imposters.
- [x] **08.5 Client:**
  - meeting button with a confirm step, showing how many meetings are left
  - full-screen alarm when a meeting is called (vibration plus sound)
  - **neutral theme for everyone**
  - Gather: Base distance and arrow, arrivals list
  - Discuss: big countdown, roster, "Skip to vote"
  - Vote: roster cards plus Skip, confirm, "Vote locked"
  - Result: tallies and the ejection reveal animation ("X was an Imposter" / "was not an Imposter")
  - spectator screen
- [x] **08.6 Bots v4:** bots walk to the Base on a meeting, then vote at random among the active players or Skip (configurable). Imposter bots vote at random among crew.
- [x] **08.7 Integration tests:** a full meeting with 8 clients: an ejection with a correct imposter reveal; a tie → no ejection; ejecting the last imposter → V2; a wrong ejection → compromised++, which can trigger V3.
- [x] **08.8 E2E:** 3 contexts + bots: call a meeting, see gather → discuss (skip) → vote → result, with the timer paused throughout.
- [x] **08.9 Wrap up.** Update the docs (MEETINGS if any clarification was needed, PROTOCOL). Commit, tag, push.

## Acceptance criteria
- The meeting lifecycle exactly matches MEETINGS.md. Game time, incubation, cooldowns and expiry freeze during meetings.
- Vote resolution and ejection effects are fully tested, including all ties and edge cases.
- Spectators receive only public information.
- The meeting screen gives away nothing about roles (neutral theme for all).

## Verification
```
pnpm verify && pnpm e2e
```
Bot game with meetings enabled (`pnpm bots … --meetings random`).

## Manual steps for the human
Optional: a group field test of the meeting flow, to judge whether 180 s is enough time to gather.

## Docs to update
MEETINGS.md, PROTOCOL.md, PROGRESS.md, DECISIONS.md (if any rule was refined).
