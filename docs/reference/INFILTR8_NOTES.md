# INFILTR8 Game Design Document: What We Took

**Source:** "INFILTR8: Complete Game Design & Experience Document" (15 pages), written by the creator for the AfterDark project. The original is at `~/Downloads/INFILTR8_Complete_Game_Design_Document.pdf` on the creator's machine and is not committed.

The creator's instruction was to use it as a reference, not a hard rule: take the good parts and choose better options where possible. Every adaptation links to an ADR in [../DECISIONS.md](../DECISIONS.md).

## Summary of the GDD
A real-world GPS social-deduction game with:
- a nested-region map, where each region has its own N/NE/…/Centre sections
- a two-stage task reveal (direction first, then precise point)
- randomized identities (`GHOST-03`)
- Crew vs Imposters, where imposters have classes (Camouflage, Saboteur, Phantom)
- solo and co-op minigames, where a co-op partner can be on either team
- secret infection: imposters see whom they infected, crew see only the total, infected players don't know
- cooldown recovery through apparent cooperation
- meetings with face-to-face discussion and voting
- win conditions: crew at 100% tasks, or ≥50% at the end; imposters at ≥60% of the original eligible players infected
- region population counts instead of exact positions
- strong safety, anti-cheat and server-authority requirements
- no kill mechanic, no team chat, no room scanning

## Adopted, adapted or rejected
| GDD item | Status | In AfterDark |
|---|---|---|
| Actual map; host-drawn or selected boundary | ✅ Adopted | Host draws a polygon or circle (MAP §1) |
| No room scanning | ✅ Adopted | Invariant in CLAUDE.md |
| Named regions, each with its own 9-section compass (R-03…R-05) | ✅ Adopted + specified | Auto partition with k-means → Voronoi → clip; sections measured from the pole of inaccessibility using true north (ADR-007, MAP §2–3) |
| Two-stage reveal: direction, then precise point after section entry (R-06) | ✅ Adopted, extended to 3 stages | Direction → pin → minigame at the pin, which merges in the creator's "revealed on arrival" (ADR-007) |
| Region population counts only, no exact positions (R-07) | 🔄 Adapted | Region counts are always shown, bucketed and delayed. Dots are a host setting with `nearby` as the default and `regions` = the GDD's behaviour (ADR-008) |
| Randomized identity tags `GHOST-NN` (R-08) | 🔄 Adapted | `WORD-NN` tags, unique by word, easy to say aloud (ADR-021) |
| Votes use game identities | ❌ Rejected | Votes use **usernames**, because tags are secret and you vote for the person in front of you (ADR-020) |
| Imposter classes: Camouflage, Saboteur, Phantom (R-10) | ✅ Adopted as default | One class per imposter; host option "all abilities" (ADR-009) |
| Camouflage changes only the imposter's own screen, temporarily (R-14) | ✅ Adopted | Plus the creator's mechanic: crew look + standing in as co-op partner (ADR-027) |
| Saboteur temporarily disables all tasks (R-15) | ✅ Adopted | Plus the creator's "reset work in progress". Lock 30 s (ADR-017) |
| Phantom fake task at a chosen location, revealed as fake only when opened (R-16, R-17) | ✅ Adopted | Queued to the next slot that refills; payloads indistinguishable; max 2 active (ADR-016) |
| Infection during apparent cooperation; imposters see infected; crew see the total; infected unaware (R-18…R-21) | ✅ Adopted | Explicit Infect channel (8 m, 10 s) + 60 s incubation (ADR-010) |
| Infected player's team membership (open) | ✅ Decided | Stays crew and keeps scoring; the status is hidden (RULES §7.1) |
| Each player counts once (R-22) | ✅ Adopted | The "compromised" set |
| Cooldown recovery through co-op (R-23) | ✅ Adopted with values | 50% → 25% → 0 per crew partner; nothing from other imposters (ADR-015) |
| Co-op partner can be any player, including an imposter (R-12) | ✅ Adopted | Partner slot (ADR-014) |
| Each co-op participant gets their own credit (R-13) | 🔄 Adapted | The team always gets the full value; only crew get personal credit (avoids a score leak, ADR-014) |
| No in-game team communication (R-24) | ✅ Adopted | ADR-020 |
| Meetings + voting (R-25) | ✅ Adopted with full rules | Gather at Base → discuss → vote → result; game time frozen; 1 per player (ADR-018, MEETINGS.md) |
| Tie = no removal; skip vote (proposed) | ✅ Adopted | MEETINGS §4 |
| Role reveal on removal (open) | ✅ Decided | Always reveal Imposter / Not an imposter (ADR-019) |
| Removal consequences (open) | ✅ Decided | Wrong ejection = compromise; spectators get public data only (ADR-019) |
| Crew wins at 100% genuine tasks (R-26) | 🔄 Adapted | Infinite tasks, with a target score as 100% (the creator's concept) |
| Crew wins at the end with ≥50% tasks (R-27) | ❌ Replaced | Progress-ratio comparison, confirmed by the creator (ADR-006) |
| Imposters win at ≥60% of the original eligible count (R-28) | ✅ Adopted | 60% of the original crew, rounded up (ADR-011) |
| Simultaneous win precedence (open) | ✅ Decided | Strict server processing order (RULES §12) |
| No kill mechanic (R-29) | ✅ Adopted | Invariant |
| 4–12 players | ✅ Adopted | Imposter count scales automatically (ADR-022) |
| Public rooms, random matchmaking, profiles, XP, cosmetics | ❌ Out of scope | ADR-029 |
| Camera/AR minigames | ❌ Out of scope (v1) | ADR-029 |
| Example minigames (wires, decode sequence, repeat pattern, hidden symbols, repair signal) | ✅ Adopted (some) | Wires, Signal Decode, Pattern Memory + the creator's lock, puzzle, crossword, key fetch (TASKS.md) |
| Task design standards (clear, stationary, accessible, rotated, server-validated) | ✅ Adopted | TASKS §3, point rotation (MAP §4) |
| Safety: public points, no trespass, stop-before-interacting, haptics, emergency leave, unsafe reporting, no recording | ✅ Adopted | PRD §8, UI_UX §5, RULES §6 |
| Anti-cheat table (spoofing, flicker, task spoofing, farming, host manipulation, spectator leaks, count inference, phantom spam, camping) | ✅ Adopted | Speed and accuracy checks, hysteresis, server verification, diminishing recovery, a host with no powers, public-only spectators, bucketed counts, fake cap, point rotation |
| Server-authoritative design and permission-filtered events | ✅ Adopted | ARCHITECTURE §3–4, ROLES visibility matrix |
| Unity + Google Maps/Mapbox suggestion | ❌ Rejected | React PWA + Leaflet (ADR-001, ADR-003) |
| GDD test cases (§16.1) | ✅ Adopted | Turned into engine and leak tests across Phases 3–10 |
