# AfterDark: Product Requirements Document

| | |
|---|---|
| **Product** | AfterDark, a real-world GPS social-deduction game (PWA) |
| **Context** | Hackathon project (Code N Mode @ SIT, organised by 32 BIT) |
| **Version** | 1.0 spec · 2026-11-23 |
| **Sources** | [CONCEPT.md](CONCEPT.md), [INFILTR8 notes](reference/INFILTR8_NOTES.md), [DECISIONS.md](DECISIONS.md) |

## 1. Vision
*Among Us, played with your feet.* A group meets in a real place such as a campus or park, opens AfterDark on their phones, and spreads out across a real map. Crew walk to hidden task spots and solve quick minigames. Imposters quietly infect people by standing close to them, sabotage the crew and plant fake tasks. Anyone can call everyone back to the Base for a face-to-face meeting and a vote. No app install, no accounts: just a link and a code.

## 2. Target users
- **Primary:** groups of 6–10 college students or friends on a campus, at an event, or at a hackathon demo.
- **Host:** one person who sets up the area in about 2 minutes on their phone.
- **Devices:** iPhone running iOS Safari 16.4+ and Android running Chrome 110+. Desktop browsers are for dev and projector demos.

## 3. Goals and non-goals
**Goals**
1. A full match runs from start to finish for 4–12 players with no crashes and no rule ambiguity.
2. **Fair hidden information:** no player can read secrets from the network or their screen.
3. **Real movement:** tasks spread players across regions, and walking dominates play time.
4. **Social deduction:** infection tension, co-op suspicion, and meetings with votes.
5. Works in a normal mobile browser, can be installed as a PWA, and is playable on spotty mobile data.
6. Demonstrable indoors through test mode and bots.

**Non-goals (v1):** accounts, matchmaking, public rooms, XP and cosmetics, chat or voice, AR/camera games, background location, native apps, persistent stats, indoor positioning (ADR-029).

## 4. Core loop
Lobby (code) → host sets area, regions, points, Base, settings → everyone ready → spawn points spread apart → hold-to-reveal roles → **play**:
- **Crew:** follow task directions ("NE of Region A") → the pin appears → solve the minigame → +points; repeat.
- **Imposters:** find crew → Infect (10 s close) → incubation → infection boxes fill; use their class ability; bluff in co-op tasks.
- **Anyone:** call a meeting → gather at the Base → discuss → vote → eject.

→ Win: crew reach the target score or eject every imposter. Imposters compromise 60% of the crew. If time runs out, progress is compared.

## 5. User stories
**Host**
- H1: As a host I can create a lobby and share a code, link or QR, so friends can join fast.
- H2: I can draw the play area on a real map and see regions, sections and task points generated automatically.
- H3: I can remove unsafe task points, draw no-go zones, and place the Base.
- H4: I can pick a preset (Quick, Standard or Long) or tune advanced settings.
- H5: I can pause, abort, force-start the spawn phase, and start a rematch with the same setup.

**Player**
- P1: I join with a code and a username and accept a safety notice.
- P2: I see a clear permission flow for location and screen-awake.
- P3: I walk to my own spawn point, then privately reveal my role and tag.
- P4: I always know which of my 3 tasks is nearest and which direction to walk.
- P5: I get buzzes or chimes on entering a task section and on arriving at a pin.
- P6: I can call one emergency meeting and vote on the meeting screen.
- P7: If my phone drops connection, I reconnect into the same game automatically.
- P8: At the end I see who was who, what happened, and the stats.

**Crew**
- C1: Before arriving, I can't tell which tasks are fake or what they are.
- C2: Co-op tasks make me find someone by their secret tag, at the risk that they're lying.
- C3: The infection boxes tell me how badly we're doing.

**Imposter**
- I1: I see who is infected and who my allies are.
- I2: I can start an infection when someone is within 8 m, and see its progress.
- I3: I can use my class ability on cooldown: Task Stop, Fake Task or Camouflage.
- I4: As Camouflage, my screen can pass for crew when someone checks it.

## 6. Functional requirements
| ID | Requirement | Phase |
|---|---|---|
| FR-1 | Lobby create/join by 6-character code, usernames, ready, host hand-over, kick, reconnect | 1 |
| FR-2 | Safety notice must be accepted to join | 1 |
| FR-3 | Live location pipeline with accuracy, staleness and speed checks; GPS simulator in test mode | 2 |
| FR-4 | Host draws the boundary (polygon or circle); settings with presets | 2 |
| FR-5 | Automatic regions with a 9-section local compass; task-point pool; no-go zones; Base | 3 |
| FR-6 | Visibility modes (nearby, regions, all) and bucketed region counts | 3 |
| FR-7 | Auto-start countdown, spread-out spawns, reach detection, timeout, force start | 4 |
| FR-8 | Role, tag and class assignment; hold-to-reveal; red/blue themes | 4 |
| FR-9 | Zone enforcement with personal penalties; host pause and abort | 4 |
| FR-10 | 3 task slots, 3-stage reveal, minigame framework with server verification, reroll, report unsafe | 5 |
| FR-11 | Team score, crew win at target | 5 |
| FR-12 | Public HTTPS deployment with auto-deploy | 6 |
| FR-13 | Infect channel, incubation, compromised count, infection boxes, imposter win, time-up comparison | 7 |
| FR-14 | Meetings: call, gather, discuss, vote, eject, spectators | 8 |
| FR-15 | Saboteur Task Stop, Phantom fake tasks, ability framework, "all abilities" mode | 9 |
| FR-16 | Co-op tasks across teams, partner slot, PIN relay, Camouflage, cooldown recovery | 10 |
| FR-17 | Full minigame catalog (7 solo + 1 co-op) and balance tooling | 11 |
| FR-18 | Results screen, rematch, end early | 12 |
| FR-19 | Installable PWA, offline shell, wake lock, haptics and sound, How-to-Play | 13 |
| FR-20 | Rate limits, hardening, load test, demo script | 14 |

## 7. Non-functional requirements
| ID | Requirement |
|---|---|
| NFR-1 | Position-to-screen latency ≤ 1.5 s (95th percentile) on 4G |
| NFR-2 | Initial JS ≤ 300 KB gzipped; first paint ≤ 2.5 s on mid-range Android over 4G |
| NFR-3 | One server instance handles ≥ 20 concurrent lobbies of 8 (load test, Phase 14) |
| NFR-4 | Battery drop ≤ 15% per 25-minute match on a typical phone (field test) |
| NFR-5 | WCAG AA contrast; tap targets ≥ 44 px; no colour-only cues |
| NFR-6 | Privacy: positions are kept in memory only, deleted when the lobby ends, and never logged |
| NFR-7 | Security: no hidden information in any payload to unauthorised clients (leak tests) |
| NFR-8 | Reliability: reconnect restores full state; a server tick never throws (errors are contained per room) |

## 8. Safety and privacy
- **Physical safety comes first:**
  - a safety notice on join
  - a "Stop somewhere safe" interstitial before every minigame
  - haptic and audio guidance, so players don't stare at the screen while walking
  - no-go zones, plus unsafe-point reporting
  - running is never required
  - leaving the game is always possible
- **Location data:** used only to run the match. It lives in server memory only, is never written to disk or logs, and is deleted with the lobby. Other players never see your exact position with your identity attached.
- **No recording** of meetings, and no camera use in v1.

## 9. Success metrics (hackathon)
- A full 8-player match (human or bot mix) completes without errors.
- Judges can play a test-mode demo within 60 s of opening the link.
- Field test: players rate it "fun" (≥ 4/5) and the rules are clear without explanation after one game.

## 10. Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| GPS inaccuracy (±5–15 m, worse near buildings) | Wrong reveals and infections | Accuracy gating (≤30 m), hysteresis, an 8 m infection radius, a 15 m reach radius, field tuning |
| Browser stops GPS when the screen locks | Players go stale | Wake Lock API, stale handling, a clear "keep the app open" UX |
| iOS PWA quirks (no vibration, wake-lock support) | Weaker feedback | Sound and visual fallbacks; iOS 16.4+ supports wake lock |
| Unreachable or unsafe task points | Frustration, safety | Host review of points, no-go zones, reroll, reporting |
| Render free tier sleeps or restarts | Lobby lost | Warm before the demo; document; in-memory state is accepted (ADR-002) |
| Hidden-information leak through the payload | Breaks the game | Allow-list views and leak tests from Phase 1 |
| Scope too large for the hackathon timeline | Unfinished | Phase order delivers a playable loop by Phase 7. Later phases are additive. |
| One session can't finish a phase | Context loss | Checkpoint protocol in CLAUDE.md ("resume at task N.k") |

## 11. Glossary
See [RULES.md §2](RULES.md#2-glossary).
