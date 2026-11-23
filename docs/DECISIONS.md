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

### ADR-030 · Toolchain pins: Node 24 LTS for CI/Render, TypeScript 6.0 · Accepted (Phase 0)
**Decision:** `.nvmrc` = `24` and `engines.node` = `>=24 <27`. CI and Render use Node 24, and local development on Node 26 also works. TypeScript is pinned to `~6.0`.
**Why:** Render's current default is Node 24 and its docs don't mention Node 26, so 24 is the safe production target. The bounded range follows Render's advice to always set an upper limit. TypeScript 7 (the native Go port) is the npm `latest`, but it has no stable JS API, and typescript-eslint 8 requires `typescript <6.1`. Type-aware linting is worth more than the faster compiler.
**Revisit:** when typescript-eslint supports TS 7, or Render documents Node 26.
**Rejected:** TS 7 with linting that isn't type-aware; pinning Node 26 without confirming that Render supports it.

### ADR-031 · Shared is consumed as TypeScript source; the server is bundled with tsup · Accepted (Phase 0)
**Decision:** `@afterdark/shared` exports `./src/index.ts` and has no build step. Vite (client), tsx (server dev) and Vitest compile it directly. The production server is one ESM bundle built by tsup, with `noExternal: ['@afterdark/shared']`.
**Why:** no watch/build ordering between packages and no stale `dist`. Node can't run `.ts` straight out of a workspace package in production, so the server bundle inlines it.
**Rejected:** project references with `tsc -b`, which add `composite` configs and a build order for no benefit at this size.

### ADR-032 · Config: the type is inferred from the zod schema; auto rules are data · Accepted (Phase 0)
**Decision:** `GameConfig` is `z.infer<typeof gameConfigSchema>`, and `DEFAULT_CONFIG` is checked with `satisfies GameConfig`. The schema has host ranges for editable keys and sanity checks for fixed ones. `HOST_CONFIG_TIER` lists the editable keys (basic ✅ / advanced ⚙️), and `editableConfigPatchSchema` (strict and partial) validates `lobby:updateConfig`. Numbers that CONFIG.md had only in prose notes became keys: `imposterCountAuto`, `minCrewRemaining`, `regionCountAutoMaxAreaM2`, `lobbyCodeAlphabet`, `reanchorFixes`, `targetScoreHintPerCrew` and `coopPersonalPoints`. The client's network tuning also became keys: `clockSyncSamples`, `clockSyncIntervalMs` and `ackTimeoutMs`.
**Why:** this enforces Invariant 6 (every number comes from config) with one source of truth for both the type and the validation, so the two can't drift apart.

### ADR-033 · Lint-enforced invariants and tooling defaults · Accepted (Phase 0)
**Decision:**
- ESLint bans `Date.now()`, `new Date()` and `Math.random()` in `apps/server/src/engine/**` and `views/**` (Invariant 5).
- `no-console` applies to the server and shared code (pino only).
- pino redacts `token`, `lat`, `lng` and `role` paths as a safety net for Invariant 8.
- Markdown is excluded from Prettier, because the hand-formatted spec tables would churn.
- pnpm 11's `allowBuilds` allows only `esbuild`'s postinstall.
- Socket handlers go through `validated()` (zod before logic, a uniform `Ack`, and safe when the client sends no ack callback).
**Why:** a rule the machine checks can't be forgotten in a later session.

### ADR-034 · Usernames: NFC, trimmed, combining marks allowed · Accepted (Phase 1)
**Decision:** `usernameSchema` normalises to NFC, trims, collapses runs of spaces, and allows `[\p{L}\p{M}\p{N} _.-]`, 2–16 **code points**. Uniqueness compares `toLocaleLowerCase('en-US')`.
**Why:** the documented charset `[\p{L}\p{N} _.-]` rejects most Indic names (Devanagari vowel signs are `\p{M}`), which matters for a hackathon in India. NFC stops `é` written two ways from being two "different" names. Format characters (`\p{Cf}`, e.g. right-to-left overrides), emoji and markup are still rejected, and 16 code points limits combining-mark abuse.
**Rejected:** the original charset; counting UTF-16 units.

### ADR-035 · `GameConfigPublic` is the host-editable config · Accepted (Phase 1)
**Decision:** `PlayerView.lobby.config` holds exactly the editable keys (`EDITABLE_CONFIG_KEYS`, copied one by one). Fixed 🔒 keys are constants, so the client reads them from `DEFAULT_CONFIG` in shared.
**Why:** everyone must see the rules they are committing to (RULES §3.6), and fixed keys never differ between lobbies, so sending them would only add bytes. The UI also reads ranges from the schema (`editableNumberRange`), so limits are never hard-coded.

### ADR-036 · Lobby disconnects un-ready the player; the host hands over after 30 s offline · Accepted (Phase 1)
**Decision:**
- In the lobby, a disconnect sets the player to not ready, which cancels any running countdown.
- A host who has been disconnected for `hostDisconnectGraceS` (30 s) passes host status to the earliest-joined connected player. Reconnecting does not take it back. Leaving hands over immediately (RULES §3.8).
**Why:** a disconnected player can't confirm they're ready, and Phase 2 makes "ready" depend on a fresh GPS fix anyway. Without a hand-over, a host whose phone dies would freeze the lobby (nobody could change settings or kick). The grace period stops a brief signal drop from moving host.
**Rejected:** handing over on any disconnect (too jumpy on mobile); never handing over on disconnect (lobby can get stuck).

### ADR-037 · Sessions live outside the engine; the Room queue is synchronous dispatch · Accepted (Phase 1)
**Decision:**
- Session tokens (22 symbols ≈ 132 bits) live only in `SessionRegistry` and the device's localStorage. `RoomState` has no tokens, so `projectView()` can't leak one. A kick bans the token for that lobby (`session:resume` → `KICKED`).
- Player IDs and tokens come from Web Crypto in the gateway and are passed into engine commands, so the engine stays pure.
- `Room.dispatch()` and `Room.tick()` are synchronous and never await. On Node's single thread this already serialises every command and tick, so there is no explicit queue object.
- The rate limiter uses a monotonic wall clock (`performance.now()`), not the injected game clock: it is transport-level, and a frozen test clock would otherwise block every socket.
**Note:** `lobby:join` carries no token, so a kicked person could rejoin under a new name from a fresh session. That's the most RULES §3.8 can mean without accounts (ADR-029); the host can kick again.

### ADR-038 · Clock offset from the lowest-RTT sample, not the median · Accepted (Phase 1)
**Decision:** the client keeps Phase 0's estimator: of `clockSyncSamples` (5) pings, the lowest-RTT sample sets the offset. Task 01.9 said "median of 5".
**Why:** the lowest round trip has the least room for path asymmetry, which is the main source of error (NTP-style). The median mixes in samples delayed by queueing. CONFIG.md already documented this.
