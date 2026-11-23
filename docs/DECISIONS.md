# Decision Log (ADR-lite)

Each entry records **what** was decided, **why**, and the **alternative** that was turned down.

Status values:
- **Confirmed:** the creator explicitly chose it.
- **Accepted:** Claude decided it under the creator's instruction to "choose better decisions"; the creator can override it.
- **Superseded:** replaced by a later entry.

To change a rule, add a new ADR that supersedes the old one, then update [RULES.md](RULES.md), [CONFIG.md](CONFIG.md) and the code.

Sources: [CONCEPT.md](CONCEPT.md) (the creator's pitch) and [reference/INFILTR8_NOTES.md](reference/INFILTR8_NOTES.md) (the GDD).

---

### ADR-001 · Stack: React/Vite PWA + authoritative Node/Socket.IO server · Confirmed
**Decision:** a pnpm monorepo in TypeScript, made of three packages:
- `apps/client`: Vite, React, Tailwind, Zustand, react-leaflet and vite-plugin-pwa
- `apps/server`: Node, Express and Socket.IO
- `packages/shared`: types, zod schemas, config, geo, RNG and minigames

**Why:** hidden information (roles, infection, fake tasks) and server-side timers (channels, incubation, cooldowns) need one long-running authority, and Socket.IO rooms map neatly onto lobbies.

**Rejected:** Supabase Realtime, which has no game loop and makes hidden information awkward. PartyKit/Durable Objects, which add more vendor-specific moving parts.

### ADR-002 · In-memory state, no database · Accepted
**Why:** matches are short-lived, there are no accounts, and it keeps the hackathon build simple.
**Cost:** a server restart drops every lobby. That is acceptable, and documented in the PRD risks.

### ADR-003 · Maps: Leaflet + CARTO Dark Matter + Leaflet-Geoman + turf.js · Accepted
**Why:** free with no API key, a dark style that suits "AfterDark", mature drawing tools, and robust geometry operations.
**Rejected:** Google Maps and Mapbox, which need keys and billing.

### ADR-004 · Infection radius: host setting, default 8 m (3–15) · Confirmed
**Why:** phone GPS is only accurate to about ±5–15 m. A 3 m radius would fail even with two players side by side. Fixes worse than 30 m are ignored.

### ADR-005 · A camouflaged imposter's fake co-op still credits Person A normally · Confirmed
**Why:** if A's points or the team score changed differently, A would know the partner was fake. See ADR-014.

### ADR-006 · Time-up: compare progress ratios · Confirmed
**Decision:** at time-up, compare crew `min(1, score/target)` with imposters `min(1, compromised/threshold)`. The higher wins; a tie is a draw.
**Rejected:** INFILTR8's rule that crew win at the end if progress ≥ 50%, which ignores how close the imposters are.

### ADR-007 · Regions with a 9-section local compass and a 3-stage task reveal · Accepted (from INFILTR8)
**Decision:** the boundary is auto-split into 2–6 regions (k-means → Voronoi → clip). Each region has its own N…NW and Centre sections, measured from its pole of inaccessibility. A task is revealed in three stages: direction, then the exact pin after the player enters the section, then the minigame at the pin.
**Why:** it turns the map into gameplay (exploration) and hides exact task points until earned. It also fulfils the creator's "task revealed only when the player reaches the location".
**Rejected:** host-drawn regions only (too slow to set up). A single global compass (the GDD explicitly forbids it).

### ADR-008 · Player visibility is a host setting, default `nearby` · Accepted
**Decision:** three modes:
- `nearby`: anonymous dots within 40 m (default)
- `regions`: counts only
- `all`: anonymous dots everywhere

Dots never carry an identity. Region counts are bucketed and refreshed every 30 s.

**Why:** the creator wanted "players as dots". The GDD wants privacy and aggregate counts only. With meetings in the game, global live tracking would make deduction trivial (everyone could see who walked with whom). `nearby` keeps the radar feel at night without global surveillance, and `all` is still available.

### ADR-009 · Imposter classes by default; "All abilities" as an option · Accepted
**Decision:** each imposter gets one secret class (Saboteur, Phantom or Camouflage), drawn without repeats, plus Infect. The host can choose `all`, which is the creator's original design.
**Why:** with 2 imposters, 2 × 3 abilities on top of Infect overwhelms the crew and clutters the interface. Classes also add replay variety and leave the crew unsure what's in play.

### ADR-010 · Infect is an explicit action with a 60 s cooldown after each success · Accepted
**Decision:** with a target in range, the imposter taps Infect; a 10 s channel follows, tolerating 3 s gaps; incubation of 60 s starts after the imposter leaves.
**Why:** automatic proximity infection would trigger at the Base, at spawn, or while walking past someone. An explicit action gives control, makes a visible tell, and the cooldown stops mass infection of a group.
**Rejected:** a fully automatic dwell, which is how the creator's text reads.

### ADR-011 · Imposter win threshold: ≥ 60% of the original crew, rounded up · Accepted
**Why:** the creator's text says both "more than 50%" and "half". The GDD says 60%. With 6 crew, ">50%" and 60% both give 4. The original crew count is fixed at role assignment.

### ADR-012 · Zone penalties affect personal score only · Accepted
**Decision:** after 15 s out of bounds, the player loses 1 personal point every 10 s. Tasks and abilities are locked, and the dot is flagged.
**Why:** if the team score dropped only for crew offenders, any player could watch a flagged dot and deduce its role.

### ADR-013 · Team score and personal score are separate · Accepted
**Decision:** the team score is genuine task points only and never goes down. The personal score is used for the MVP and penalties.

### ADR-014 · Co-op partners come from all players; partner slot; full value to the team · Accepted
**Decision:**
- Co-op partners are drawn from all active players, imposters included (from the GDD).
- Each player has one extra "partner slot".
- A completed co-op task always adds its full value to the team score.

**Why:** it creates the "is my partner an imposter?" tension, gives imposters a believable reason to be near crew, and avoids any score-based leak.

### ADR-015 · Cooldown recovery through apparent cooperation · Accepted (from INFILTR8)
**Decision:** a co-op task with a crew partner removes 50% of the imposter's remaining class cooldown, 25% the second time with the same partner, then 0.
**Why:** it rewards imposters for mingling. Diminishing returns stop farming.

### ADR-016 · Fake tasks are queued for the next slot that refills · Accepted
**Why:** this matches the creator's text ("the new task assignment could be … a fake task"). It's invisible to players, because no existing pin moves, and random, because it depends on who finishes next. There is a cap of 2 active per Phantom.

### ADR-017 · Task Stop locks tasks for 30 s (range 10–60) · Accepted
**Why:** the creator specified 10 s. Now that it is a whole class's only ability, 10 s is too weak, since walking dominates play time.

### ADR-018 · Meetings: gather at the Base, game time frozen, 1 per player · Accepted
**Why:** the creator asked for meetings with face-to-face discussion and the GDD supplied the flow. Freezing game time stops meetings from eating crew time. A grace period at start, a cooldown and a per-player limit stop spam. A 30 s grace after each meeting stops infections at the crowded Base.

### ADR-019 · Ejection always reveals Imposter / Not an imposter; a wrong ejection compromises · Accepted
**Why:** a wrongly ejected crew member counts toward the imposter threshold, which makes careless voting costly and fits the fixed denominator. Because the compromised count would go up visibly anyway, keeping roles hidden on ejection is impossible. So ejections are always revealed, and this is not a setting.

### ADR-020 · No in-app chat; the vote roster uses usernames · Accepted
**Why:** there is no team communication (GDD 6.7), and discussion is physical. People vote for the person standing in front of them; tags are secret, so a tag roster would be unusable.

### ADR-021 · Secret tags in the format `WORD-NN` · Accepted
**Why:** they combine the creator's "unique character name" with the GDD's `GHOST-03` idea. They are easy to say aloud and unique by word.

### ADR-022 · Lobby size 4–12; imposter count scales automatically · Accepted
**Decision:** 4–5 players → 1 imposter, 6–9 → 2, 10–12 → 3. The host can override, but at least 3 crew must remain.
**Why:** the creator said "approx 8" with 2 imposters. The GDD said 4–12.

### ADR-023 · Spread-out spawn phase before roles · Confirmed (creator's concept)
**Why:** nobody can see another person's role screen when roles are revealed. There is a 5-minute timeout and the host can force the start, so the game never stalls.

### ADR-024 · Test mode: simulated GPS and bots · Accepted
**Why:** Claude can't walk around outside. A hackathon demo is likely indoors. The flag is per lobby and every player sees a badge, so it can't be used to cheat in secret.

### ADR-025 · Deploy as one Render web service · Accepted
**Why:** client and server share an origin, so there is no CORS and HTTPS/WSS is automatic. Auto-deploys from GitHub.
**Cost:** the free tier sleeps when idle, so the service must be warmed before a demo (or upgraded).

### ADR-026 · Git: trunk-based on `main`, conventional commits, `phase-NN-done` tags · Accepted
**Why:** a solo, Claude-only workflow. Tags give the creator a rollback point after each phase session.

### ADR-027 · Camouflage is local-only, can join any waiting co-op, and extends through a co-op · Accepted
**Decision:** for 45 s, only the imposter's own screen shows the crew interface. Other players' screens and the server identity never change (GDD). While active, the imposter can stand in for a co-op partner (creator's concept). It extends if a co-op task is still running.

### ADR-028 · The meeting screen uses a neutral theme for everyone · Accepted
**Why:** a red imposter screen glimpsed in the meeting circle would give the imposter away instantly, and that isn't a fair way to be caught.

### ADR-029 · Out of scope for v1 · Accepted
Accounts, profiles, XP and cosmetics; public rooms and matchmaking; chat; AR/camera minigames; background location (browsers can't do it); persistent storage; native apps; indoor positioning (test mode covers indoor demos).
