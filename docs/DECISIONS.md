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

### ADR-039 · Map tiles: standard OSM, darkened in CSS (CARTO Dark Matter now needs a key) · Accepted (Phase 2)
**Decision:** the map uses `https://tile.openstreetmap.org/{z}/{x}/{y}.png` with the CSS class `.dark-tiles` (`invert(1) hue-rotate(180deg)` plus dimming) to get a dark map. Attribution is "© OpenStreetMap contributors".
**Why:** when built in Phase 2, every CARTO URL (`dark_all`, `dark_nolabels`, `rastertiles/…`) answered with a small placeholder tile reading "API KEY REQUIRED". OSM needs no key and was already the documented fallback. Verified by a screenshot.
**Consequences:** OSM's tile policy suits light use (a hackathon, a few phones), not a public launch, so Phase 14 should revisit a keyed provider. Phase 6 CSP and Phase 13 tile caching must target `tile.openstreetmap.org`, not CARTO.
**Rejected:** shipping the watermarked CARTO tiles; a vector style (needs MapLibre and a key).

### ADR-040 · Location rules: derived quality, server-clock staleness, floored speed gap · Accepted (Phase 2)
**Decision:**
- Quality is **derived**, never stored: `fixQuality(fix, now, config)` gives `good` (accuracy ≤ `maxAccuracyM`), `weak`, or `stale` (nothing received for `staleAfterS`, measured on the server clock via `receivedAt`; stale outranks weak). `projectView` and the radar take `now` as an argument, so views stay pure; the room tick commit refreshes them each second.
- The client sends `ts` already shifted to server time (`fix.ts + offsetMs`), so a wrong phone clock can't trip the future-fix check. Fixes more than `futureFixToleranceS` (5 s) ahead are rejected.
- The speed check divides by `max(Δt, speedCheckMinDtS)` (1 s), so two stamps a few ms apart can't fake a huge speed, and an out-of-order stamp counts as the minimum gap rather than being dropped (a device clock stepping back must not freeze a player).
- A rejected jump keeps the old position but stores `locPending`. Fixes that agree with each other (speed between them ≤ `maxSpeedMps`) extend the run; after `reanchorFixes` (3) the player is re-anchored. Any accepted fix clears the run.
- `setReady(true)` needs a good fresh fix: `WEAK_GPS` if there is none or it is inaccurate, `STALE` if it is old. Un-readying never needs one. A fix that later degrades does **not** un-ready a player (flaky GPS would otherwise flap the countdown); Phase 4's spawn checks handle it.
- New config keys (🔒): `futureFixToleranceS`, `speedCheckMinDtS`, `teleportAccuracyM`, `locEventsPerSecond`.
**Known limit:** a weak, noisy fix is stored like any other, so the next good fix can look like a jump and take up to 3 fixes to re-anchor. Acceptable for now; revisit after field tests.

### ADR-041 · Radar: per-viewer salted aliases, sorted, on the room tick · Accepted (Phase 2)
**Decision:** `buildRadar(state, viewerId, now)` returns `{alias, lat, lng, flags}` per other connected, located player. The alias is 64 bits of FNV-1a over `radarSalt | viewer | target | epoch` (epoch = `floor(now / dotAliasRotateS)`), so it differs per viewer and rotates every 300 s. `radarSalt` is random per room and lives in `RoomState` but never in a view. Dots are sorted by alias so array order doesn't reveal join order. Flags are `stale` and `oob` only for now. Frames go out per player (never a room broadcast) on the Room tick, once per `radarIntervalMs` bucket, as a volatile emit. In the lobby every other player is shown ("all"-style); Phase 4 adds the visibility modes.
**Why:** viewer-specific aliases stop two players comparing dots to identify a person; sorting and rotation stop longer-term tracking. FNV isn't a MAC, but the salt is secret and the aliases only have to be unlinkable by players, not by an attacker with server access.
**Tested:** leak tests assert no player id, username, token or salt appears in any radar frame, and the integration test scans raw socket frames.

### ADR-042 · GPS simulator: a source behind `testMode`; jumps use `dev:teleport` · Accepted (Phase 2)
**Decision:**
- Simulated GPS takes effect only while the lobby is in `testMode` **and** the player chose it (`?sim=1` pre-selects it; the Test tools panel toggles it). The host enables `testMode` in Settings, and everyone sees the badge.
- The simulator publishes fixes 4 times a second into the same store, throttle and `loc:update` path as real GPS.
- A long-press or marker drag **teleports** with `dev:teleport` (server-checked: testMode only), because a jump far beyond `maxSpeedMps` would otherwise be rejected and need about 10 s of heartbeats to re-anchor. Walking (WASD, D-pad) uses plain `loc:update`. TESTING.md said `dev:teleport` was for bots only; it is for both.
- In dev or with `?sim=…`, `window.__afterdarkMap` exposes the Leaflet map so Playwright can map lat/lng to pixels. It exposes nothing else.

### ADR-043 · Boundary editing: the server's ring is the source of truth · Accepted (Phase 2)
**Decision:** the host draws a polygon, rectangle or circle with Geoman. The drawing is removed locally, sent as a `BoundaryInput`, and the ring that comes back in the view is rendered (as an editable polygon for the host). A circle is stored as its 64-gon, so later edits are polygon edits. Edits are sent 500 ms after the last change; the echo of our own edit doesn't rebuild the layer mid-drag. Self-intersection is blocked in the UI (`allowSelfIntersection: false`) and re-validated on the server. There is no "clear boundary": redrawing replaces it. Re-sending an identical ring is a no-op and doesn't un-ready anyone.
**Why:** one authoritative copy avoids client/server drift, and an invalid drawing simply leaves the old boundary in place with the server's message in a toast.

### ADR-044 · Region geometry runs on a local metric plane; section polygons are derived on the client · Accepted (Phase 3)
**Decision:** k-means, Voronoi, clipping and the section wedges run in a flat plane in metres (x east, y north) around the area's centre (`geo/plane.ts`). The map is linear, so straight edges and area ratios survive the trip back to `[lng, lat]`; over a few kilometres the error against the sphere is negligible. Only `sectionOf` (the rule that counts) uses geodesic `bearing` and `distance`. The view carries each region's polygon, origin, ρ and a 9-entry section summary (`{id, areaM2, usable}`); the 9 section polygons are **not** sent: the client rebuilds them with the same shared `sectionShapes()` when the host previews sections. The pole of inaccessibility comes from `polylabel` run in that plane (wrapped in `geo/polylabel.ts` because the package ships no types), with centroid and sampled-point fallbacks.
**Why:** degrees of longitude are shorter than degrees of latitude, so planar k-means or Voronoi in raw degrees would skew the regions at any latitude but the equator, and `polylabel` needs planar input. Sending 54 section polygons to every player on every view would add tens of kilobytes for something only the host's preview needs. The tests prove that points sampled in a section polygon get that section from `sectionOf`, except within about 1.5° of a wedge border, where the plane and the sphere bearings differ.
**Rejected:** doing everything in raw lng/lat (skewed regions). Sending section polygons (payload size).

### ADR-045 · Setup is deterministic from seeds in the room state; a new layout resets names, never host points or the Base · Accepted (Phase 3)
**Decision:** `state.setup` holds `seed` (regions), `poolSeed` (auto points), the no-go rings, the regions with their section areas, the pool and the Base. The engine stays pure: "regenerate" takes the host's optional seed or moves one step along a hash chain (`hash(code|seed)`), so the same boundary on the same room always gives the same layout. A new boundary, region count or regenerate rebuilds regions and auto points. Host-added points and a host-placed Base survive a rebuild as long as they are still inside the playable area (they are re-labelled with their new region and section). A no-go change keeps the seeds, so the layout barely moves, drops points inside the zone, and keeps region names. A **new** layout (regenerate, count or boundary change) resets names to Region A, B, C… A host-deleted auto point stays deleted until the next regenerate. The default Base is the centroid of the largest region snapped to the nearest pool point (the region's origin when the pool is empty) and is recomputed while it is still the default.
**Why:** replays and tests need the same input to give the same output (Invariant 5), and the host should not lose their hand edits to a tiny change elsewhere. Names after a different layout would label different ground, so keeping them would mislead.

### ADR-046 · Region counts: a 30 s snapshot, with the viewer's own region live · Accepted (Phase 3)
**Decision:** the tick takes a snapshot of which region each active, non-stale player is in whenever the last one is older than `regionCountRefreshS`. A viewer sees bucketed labels (`0`, `1`, `2–3`, `4+`) where their own entry is replaced by their current position. Counts are strings from `regionCountBuckets`, never numbers, and never carry ids. A layout change drops the snapshot (region ids may change). In Phase 3 `PlayerView.game` holds only `regionCounts`, and exists as soon as the lobby has regions, so the lobby can show them for testing.
**Why:** without the replacement a viewer could read "their region has 0 players" from a snapshot taken before they arrived, or watch a count tick up the moment they step into a region: both reveal that the data is stale or who moved. With it, the viewer's own region always counts them, and everyone else's movement still waits for the next refresh.

### ADR-047 · The lobby radar follows `playerVisibility`, default `nearby` · Accepted (Phase 3)
**Decision:** from Phase 3 the radar honours the visibility mode in the lobby as well: `nearby` shows anonymous dots within `nearbyRadiusM` of the viewer's own latest fix (nobody if the viewer has no fix), `regions` shows nothing, `all` shows everyone. Phase 2's "every other player" behaviour is now the `all` mode. The e2e specs that need to see far-away dots set "Who you see on the map" to Everyone.
**Why:** ADR-008 makes `nearby` the default so global tracking can't make deduction trivial, and a lobby that behaves differently from the game would hide problems until play. The cost is that players gathering at a distance don't see each other in the lobby unless the host picks Everyone.

### ADR-048 · Setup validity counts usable points; region-algorithm numbers moved into CONFIG · Accepted (Phase 3)
**Decision:** setup is valid when a boundary and Base exist and the **usable** pool points number at least `minTaskPointsPerPlayer` (4) × players over at least `minRegionsWithPoints` (2) regions. A usable point is enabled and lies in a section of at least `minSectionAreaM2`. New 🔒 keys: `minTaskPointsPerPlayer`, `minRegionsWithPoints`, `regionSampleCount` (400), `regionKmeansIterations` (20), `minRegionAreaRatio` (0.1), `regionNameMaxLen` (20). `startBlockers` now takes a `SetupSummary` (`summarizeSetup`) instead of a boundary flag and may also return `baseMissing`, `tooFewPoints` and `tooFewRegions`; the client checklist uses the same function.
**Why:** Invariant 6 (every number in config) and one validation shared by server and client. Counting usable rather than all points stops a pool full of unreachable spots from passing.

### ADR-049 · Clipped Voronoi cells: cut-off parts go to the neighbour they border most · Accepted (Phase 3)
**Decision:** after clipping a Voronoi cell to the playable area, its largest part stays and any other part joins the neighbouring region with the longest shared edge (measured by sampling the part's outline against the neighbour's, 0.5 m tolerance). A part that borders nobody (a no-go zone isolates it) stays with its own region as an island. Parts under 1 m² are dropped as clipping dust. If a region comes out under `minRegionAreaRatio` of the average, the split re-runs with one region fewer, never below 2.
**Why:** it follows MAP_AND_REGIONS §2 for concave shapes and keeps every region reasonably connected while still covering the whole area. Islands are rare and harmless: `sectionOf` and the compass work on multi-polygons.


### ADR-050 · Spawns and roles come from a secret per-room seed, never from the lobby code · Accepted (Phase 4)
**Decision:** `RoomState.secretSeed` is derived from the room's random `radarSalt` (`hashSeed('game|' + salt)`). Spawns draw from `createRng(hash(secretSeed|spawns))` and roles, tags and classes from `hash(secretSeed|roles)`. The lobby code is public and also seeds the (public) map layout, so it must never seed anything secret. The spawn generator draws `spawnAttempts` (8, 🔒) layouts, each already spaced ≥ `spawnMinSeparationM` by best-candidate sampling, and keeps the one with the largest minimum distance between spawns; RULES §4.1's "relax down to 40 m" is therefore built in: best-candidate never asks for more than the 40 m floor. If no attempt fits everybody (E3), see ADR-052.
**Why:** the source is public, so a seed anyone can compute (the code) would let a player work out every role. 32 bits of seed is a small search space in theory, but an attacker would have to search it from only their own role and tag while a 25-minute match runs; accepted for this game's threat model. Tests and the e2e server pin the salt (`radarSalt` in `newLobby`, `TEST_ROOM_SALT`, ADR-056) to reproduce roles.

### ADR-051 · Phases are `lobby → spawning → reveal → playing → ended`; roles exist from the reveal · Accepted (Phase 4)
**Decision:** `Phase` replaces the placeholder `starting`. The start countdown still runs inside `lobby`; when it ends the room enters `spawning`. Roles, tags, classes, `originalCrewCount` and the infection threshold are assigned when the reveal begins (`beginReveal`), to players who have not `left`. If fewer than `minPlayers` active players remain at that moment the game ends with no winner (`abort`). The match clock is created at the reveal but starts only when play begins; the 10 s reveal is real time and outside game time. One function, `advance()`, runs after every command and every tick (spawn reach → reveal → play → zone → victory), so a fix that completes the spawn phase moves the game on within the same call. A game that has `ended` accepts only location, connection and leaving.
**Why:** one place for the state machine makes "every transition and every illegal command" testable, and running it after commands as well as ticks gives the sub-second response ARCHITECTURE §3 asks for.

### ADR-052 · Reaching a spawn is sticky; a spawn failure keeps the lobby and tells everyone · Accepted (Phase 4)
**Decision:** once a good fix has been within `reachRadiusM` of a player's spawn, `reached` stays true even if they wander off (RULES §4.3 says "has reached", not "is at"). Reach is judged on good fixes only, on every accepted fix and every tick. When the countdown ends and the area cannot fit the spawns (E3), the room stays in `lobby`, everyone is un-readied and the event `lobby.startFailed {reason:'spawns'}` is sent ("the area is too small to spread everyone out"), so the host can enlarge the area. A cheap area-based blocker in the checklist was rejected: spawn feasibility depends on the player count and the shape, and only the real generator can answer it.
**Why:** non-sticky reach would let a player un-reach by stepping aside and leave the group waiting on a flapping counter. Failing at the last moment is rare (a valid setup holds ≥ 4 points per player), and an honest message beats a wrong prediction.

### ADR-053 · `GameClock` is plain data with pause reasons; the display pair never moves with `now` · Accepted (Phase 4)
**Decision:** `engine/clock.ts` holds `{gameMs, runningSince?, started, reasons[], stoppedAt?}` in the room state and pure functions that take `now`. `reasons` is a set (`host`, later `meeting`), so overlapping pauses stay paused until every reason is cleared. The view gets `clock: {endsAt, pausedAt?}`: while running `endsAt` is constant; while stopped `pausedAt` is the moment of the stop and `endsAt − pausedAt` is the remaining time. Before play the clock view is `revealEndsAt + playTime`. While the host has paused, every command except location, teleport, connect, disconnect, leave, pause, resume and abort is rejected with `PAUSED` in `reduce`.
**Why:** a display pair computed from `now` would change on every projection, defeating the change-only `ViewEmitter` fingerprint (five snapshots a second per player for nothing). Storing `stoppedAt` keeps paused views byte-identical.

### ADR-054 · Zone: good fixes only, on game time, no-go zones included · Accepted (Phase 4)
**Decision:** `isOutOfBounds` is "outside the boundary ring or inside any no-go ring" (point-in-polygon, no clipping, so it is cheap per fix). It replaces the boundary-only check in views and radar, which closes the 🟠 known issue from Phase 3. Zone state changes only on a **good** fix; a weak or stale fix neither starts nor clears a stay. Time is game time, so a pause freezes it. Penalties: one `zonePenaltyPoints` at the end of `zoneGraceS`, then one per `zonePenaltyIntervalS`; if a long gap in good fixes ends with the player still outside, the missed ticks are charged together in one `zone.penalty` event. Penalties change only `personalScore`, never `teamScore` (ADR-012). `zone.warning` and `zone.penalty` go only to the player concerned. `me.zone` has the same shape for every role; `isZoneLocked` is the flag later phases check to block tasks and abilities.
**Why:** judging weak fixes would punish bad GPS and let players dodge penalties with a bad fix; wall-clock penalties would punish players during a host pause.

### ADR-055 · Victory: V4 by exact fractions, V5 counts leavers and counts from the roles · Accepted (Phase 4)
**Decision:** `checkVictory` runs after every command and tick in the order V1 → V6; V1–V3 are TODO stubs naming Phases 5, 7 and 8. V4 compares `min(teamScore, target)/target` with `min(compromised, threshold)/threshold` by integer cross-multiplication (E30: equal is a draw, including 0 vs 0). V5 forfeit: a side is gone when every player of that role is disconnected (including players who left, who are permanent disconnects) for `forfeitAfterS`, **counted from the moment roles were assigned**, so time spent offline during the spawn phase does not count; a side with no members never forfeits. If both sides are gone, the game is a draw by forfeit. V6 is the host's abort (`winner: null`).
**Why:** floats can misorder fractions that are equal on paper. The roles-assigned floor keeps E2 ("disconnect during spawn, reconnect into the reveal") from ending a game before it started.

### ADR-056 · Bots: one shared walker, an in-process driver and a socket CLI; a pinned room salt for e2e · Accepted (Phase 4)
**Decision:** `BotWalker` (`packages/shared/src/bots.ts`) is the bots' whole movement: walk to the spawn at `botSpeedMps` (1.4), then wander in legs of up to `botWanderLegM`; the reported fix adds `botJitterM` of noise; steps are `botStepS` apart. Two drivers use it. (1) **`dev:addBots`** (test mode, host, lobby only): `BotDriver` (`rooms/bots.ts`) adds bots as ordinary players (`PlayerState.bot`) and, on each room tick, sends them the same `locUpdate`/`setReady` commands a socket would cause, so they go through the real engine; they have no socket and so no views. (2) **`pnpm bots -- --code X --count 7`** (`tools/bots`) connects real sockets and speaks the public protocol only (it never teleports, so it works with test mode on or off). Bots are never chosen as host while a human could be, and go offline (so an empty room can be swept) when no human is connected. In-process bots exist so a single human can demo and e2e-test a full lobby with no extra processes. For reproducible roles, `TEST_ROOM_SALT` gives every new room that salt, **only** when `ALLOW_TEST_MODE` is on (`env.ts` drops it otherwise); the e2e server uses `e2e-a`, under which the host of an 8-player lobby is crew and the host of a 5-player lobby is an imposter.
**Why:** a second implementation of the walking would drift; going through `dispatch` means bots can't do anything a player couldn't (including being rejected for a bad fix). A pinned salt is the smallest way to get both role screenshots without adding a cheat command to the protocol.

### ADR-057 · The role card is hold-only and never in the DOM otherwise; in-game host hand-over uses the lobby grace · Accepted (Phase 4)
**Decision:** the reveal screen is neutral. The role card is rendered only while the button is held (pointer, or Space/Enter), is `pointer-events-none` and carries its own `data-theme`, so the page behind it, and the DOM when nobody holds, contain no role. `<html data-theme>` becomes crew or imposter only when play starts, and is neutral in the lobby, spawn, reveal and ended screens. The player's `infection` status exists in `PlayerState` from this phase (nothing sets it yet), so leak tests can prove that a crew view looks the same for healthy, exposed and infected players before Phase 7 builds infection. Host hand-over in a running game (E31) reuses `hostDisconnectGraceS` (30 s) and prefers humans over bots; a host who leaves hands over at once.
**Why:** a reveal that re-themes the whole screen on load would show the role to anyone glancing over a shoulder, which defeats the hold. Having the field early makes the invisibility test real now rather than a promise.

### ADR-058 · Tasks live on the player in the room state; every roll has its own seeded RNG · Accepted (Phase 5)
**Decision:** a crew member's tasks are `PlayerState.tasks: TaskState[]` (id, kind, pool `pointId`, lat/lng, region, section, hidden minigame `type`, `stage`, `holdSince`, `atPin`, and `open` while a minigame is open). Only crew get a list (imposters keep `undefined` until Phase 10's partner slot). `GameState` gains `taskSeq`, `pointUsedAtGameMs` and `fakeQueue`. Every roll (a new task, a puzzle, a lock re-roll) draws a fresh `createRng(hash(secretSeed | 'task' | taskSeq++))`, so a game is reproducible from the secret seed and no `Math.random()` is used (Invariant 5). Task ids are 16 URL-safe symbols made from that RNG; they are labels, not secrets (ownership is checked by player). The fake-task hook is real but empty: `refillSlots` takes the oldest `fakeQueue` entry first, a fake is a `TaskState` with `fake: true`, and it already pays 0 and answers `fooled`.
**Why:** one owner per task keeps the per-player view trivial and "other players' tasks are never present" structural. The counter keeps rolls independent of how many other RNG draws happened.

### ADR-059 · Commands that answer their caller do it with a `reply` effect · Accepted (Phase 5)
**Decision:** `task:open`, `task:action` and `task:submit` carry data in their ack (the puzzle, the lock feedback, the result). The pure engine returns it as an effect `{kind:'reply', playerId, reply}`; `socket/handlers/tasks.ts` finds it with `runForReply` and returns it as the ack. `wiring.ts` never sends a reply as a frame, so private answers cannot reach a room broadcast. A second effect, `{kind:'audit', what:'unsafePoint', pointId}`, lets the engine ask for a log line that carries only a point id (Invariant 8).
**Why:** the alternatives (reading the state back in the handler, or a side channel) would duplicate engine knowledge or break purity.

### ADR-060 · Choosing a task: section weights, then relaxed point wishes · Accepted (Phase 5)
**Decision:** MAP §4 as written. Section weight is 1, ×0.5 in the player's current region, ×0.25 if one of their tasks is already in that section; sections with no eligible point (every enabled point there is already the player's own) are dropped. Within the section the point is picked at random among those that are **free** (no other player's task), **rested** (not used within `taskPointReuseCooldownS`) and **far** (≥ `taskMinDistanceM` from the player, new key, default 60); if none satisfies all three, the wishes are relaxed in the order far, then rested, then free. A point is released (stamped as used) when its task is completed or rerolled. If the pool has no eligible point at all, the slot stays empty and is retried on every tick. Minigame types are weighted (`minigameWeights`, new key) among `minigamesEnabled` (new key, `['wires','lock']` until Phase 11).
**Why:** "where possible" needs an order, and distance is the softest wish: a shorter walk is better than two players sharing a spot.

### ADR-061 · The reveal hold is judged on good fixes, in game time, with a probe ring for hysteresis · Accepted (Phase 5)
**Decision:** `updateTasks` runs inside `advance()` (after the zone) on every command and tick. Per player: a stale fix resets every hold and every `atPin` and drops any open minigame (`task.reset gps`); a weak fix (E5) resets holds and `atPin` and reveals or opens nothing, but keeps an open minigame (the player did not move); a good fix inside the target section starts or continues the hold (`holdSince` in game ms, so a host pause freezes it); a good fix outside keeps an existing hold only if the fix's error circle touches the section (`nearTarget` probes 8 points at the accuracy radius with `sectionOf`; checked only when a hold exists, so it is cheap). At `sectionEntryHoldS` the stage becomes `pin`, one way. `atPin` is a good fix within `reachRadiusM` and not zone-locked. A minigame open while the player is more than `reachRadiusM + taskAbandonExtraM` away, zone-locked, stale, or disconnected is reset (the reveal and the stage are kept).
**Why:** the hold is a gameplay rule, so it must use the same clock as every other timer; the probe ring gives the spec's hysteresis without clipping polygons on every fix.

### ADR-062 · The lock refuses blind submits; `verify` sees the progress and `act` may swap the solution · Accepted (Phase 5)
**Decision:** `MinigameDef.verify(puzzle, solution, answer, state)` receives the progress `act` built, and `act(puzzle, solution, state, action, rng)` may return a replacement `solution`. The lock's `verify` is true only if a previous guess matched the code (`state.solved`) **and** the answer equals the code. A guess that does not match costs a try; after `lockMaxGuesses` wrong guesses `act` re-rolls the code (new solution, `rerolled: true`, same puzzle shape). A malformed guess costs nothing. Answers and actions are parsed by the game's own zod schema inside the engine (`eraseMinigame` → `check`/`act`), and a bad shape is `INVALID_PAYLOAD`, not "wrong".
**Why:** TASKS §4 says the final guess equals the code, but with unlimited `task:submit` attempts at 3 s each a player could brute-force 216 codes in minutes and ignore the 8-guess budget. Requiring the matching guess keeps the limit real.

### ADR-063 · Task interactions: tap-to-pair wires, the sheet outlives the card, report replaces everyone's task · Accepted (Phase 5)
**Decision:** Wire Connect is tap-to-pair (tap a left end, then its match; tap a connected end to undo), not drag: it works one-handed, with 56 px targets and screen readers, and every wire has a colour and a symbol. The minigame sheet is a full-screen fixed layer (not a `<dialog>`) so it can carry the result after the server removes the completed card; the parent keeps the card, the sheet decides when to close (a `task.reset` event, or the card vanishing while no submit is in flight). A wrong answer locks submitting for `taskWrongLockoutS` (game time) and the sheet shows the countdown. `task:reportUnsafe` disables the point and replaces **every** task on it, whoever holds it (they get `task.removed`); the optional reason is neither stored nor logged. Reroll uses a per-player game-time cooldown; the view's `rerollReadyAt` is omitted while the clock is stopped. The task list and cooldown sit in `game.tasks` / `game.rerollReadyAt` as PROTOCOL says, although they are private to the viewer.
**Why:** a point that is unsafe for one player is unsafe for all; dragging on a moving phone is error-prone.

### ADR-064 · Test hooks for tasks and bots that do tasks · Accepted (Phase 5)
**Decision:** `dev:autoComplete {taskId}` (test mode; the task must be open) finishes a task as if solved. `dev:setMinigames {types}` (test mode, host, lobby) limits `minigamesEnabled`, so an e2e spec can test one game at a time; pages in dev or with `?sim` expose `window.__afterdarkActions = {devSetMinigames, simTeleport}` next to `window.__afterdarkMap`. Crew bots walk to their first task, open it at the pin, wait `botTaskMinS`–`botTaskMaxS` (10–30 s, new keys) and call `dev:autoComplete`. The in-process driver reads the pin from the room state (it is test tooling); the socket CLI only uses the public view: it finds a spot in the card's section with `pointInSection` (new shared helper, also used by tests), waits for the reveal, then walks to the pin.
**Why:** bots must exercise the real reveal and open paths, but solving every puzzle in the bots would add solvers nobody ships.

### ADR-065 · Render region `singapore`; one instance; free plan · Accepted (Phase 6)
**Decision:** `render.yaml` deploys one free web service in `singapore`, the closest Render region to the players in India (valid values: oregon, ohio, virginia, frankfurt, singapore). The region cannot be changed after creation. Node comes from `.nvmrc` (24); pnpm comes from `packageManager` through `corepack enable`.
**Why:** latency matters for the 1 Hz radar and the meeting vote; state is in memory so there can only be one instance (ADR-025).
**Cost:** the free tier sleeps after about 15 minutes idle and a redeploy ends running lobbies.

### ADR-066 · Production hardening: CSP, same-origin socket, shutdown notice, room error boundary · Accepted (Phase 6)
**Decision:** helmet with a CSP allowing only `'self'`, `tile.openstreetmap.org` (images), Google Fonts (CSS and font files) and inline style attributes (React and Leaflet need them; scripts stay `'self'`). Hashed files under `/assets/` get `immutable` for a year; `index.html`, `sw.js`, `registerSW.js`, `workbox-*.js` and `manifest.webmanifest` get `no-cache`; a path with an extension that does not exist is a real 404, any other GET gets `index.html`. `trust proxy` is 1. The socket accepts a browser `Origin` only if it equals the request `Host` (WebSocket upgrades ignore CORS, so this is checked in `allowRequest`; bots and tools send no Origin). On SIGTERM the server emits `server:shutdown` to every client, waits `shutdownNoticeMs`, then closes. `Room.tick` catches and logs its own exceptions (code and error only, never state), so one broken room cannot crash the process. Commands and ticks log room code, type and duration at `debug`, and at `warn` over `slowCommandMs`.
**Why:** it is the minimum for a public URL that holds location data. A broken room should show up in the logs, not take every game down.

### ADR-067 · Infection state machine: where it lives, who hears about it · Accepted (Phase 7)
**Decision:** `engine/systems/infection.ts` runs from `advance()` after the zone, on every command and tick, in game time and only while the clock runs. An imposter holds `PlayerState.infect {readyAtGameMs, channel?, completed}`; a target carries `infection: 'exposed' | 'infected'` plus a server-only `exposure {byId, awaySince?, incubationEndsAtGameMs?}`. A channel has a fixed end (`start + infectionChannelS`), a per-gap tolerance (each gap is judged alone, `gapSince` resets when back in range) and finishes only when both are in range; two channels on one target are processed in end-time order so the first wins (E6). Incubation starts after `incubationDepartS` (new locked config key, 3 s) of the exposing imposter being away and ends `incubationS` later, measured from the moment it became true, not from the evaluation, so it does not depend on tick granularity. Events: `game.compromised {count}` goes to everyone when a box fills (the boxes are public, so the moment is public, the identity never is), `infect.completed` and `infect.failed {reason}` go only to the imposter. The target gets nothing. V3 (`compromised ≥ threshold`) is checked in `victory.ts` after V1 and before V4; only `infected` counts, never `exposed` (E9).
**Why:** a single place reads the clock and fixes, so all timing edge cases (RULES §7.1, E6–E9) are one set of tests; a count-only public event keeps the crew UI honest without leaking who.

### ADR-068 · Infect cooldown freezes out of bounds by moving a deadline; the view carries a constant deadline · Accepted (Phase 7)
**Decision:** RULES §9.3 says an out-of-bounds imposter's cooldown stops counting down. The cooldown is stored as a game-time deadline (`readyAtGameMs`), and each infection update pushes it back by the elapsed game time while the imposter is out of bounds. `me.imposter.infect.readyAt` (and the channel and incubation deadlines) are projected as server-epoch deadlines through `clockView`, so they are constant while the clock runs or is stopped and a view changes only when something happens (no 1 Hz view churn).
**Why:** a remaining-time counter would have changed on every tick and made every imposter view different every second; deadlines are how the match clock already works (ADR-017).

### ADR-069 · Chase bots: one shared brain, opt-in per room · Accepted (Phase 7)
**Decision:** `ChaseBrain` (`packages/shared/src/bots.ts`, pure apart from the Rng) decides go / infect for an imposter bot: nearest target, infect inside `infectionRadiusM − 3 m` (so GPS jitter does not flip it out of range), keep following during the channel, then retreat `infectionRadiusM + 12 m` before hunting again. In-process bots feed it positions from the room state (only players with a good fix: a stale human is not a target, otherwise the bot gets stuck on them); the CLI feeds it the radar dots without `ally`, `exposed`, `infected` or `stale` flags. It is opt-in: `dev:addBots {imposterBehaviour:'chase'}` (default `wander`) and `--imposter-behaviour chase`, so every earlier bot test (a crew win, no infections) behaves as before.
**Why:** one brain means the integration test and the CLI exercise the same behaviour; default-off keeps the Phase 5 acceptance run deterministic.

### ADR-070 · `dev:advanceClock`: test mode can jump game time · Accepted (Phase 7)
**Decision:** `dev:advanceClock {seconds: 1..600}` (test mode, host, playing, not paused) adds to the game clock's accumulated time. Every game-time deadline gets closer by that much: Infect's 60 s initial cooldown, a 60 s incubation, the match end. A Playwright spec uses it through `window.__afterdarkActions.devAdvanceClock`.
**Why:** the alternative (injecting the clock into a running server, or shortening locked config) either cannot reach a real server over sockets or lets a test run with numbers the product never uses. Jumping game time keeps every real rule in play and still turns a 3-minute scenario into 40 s. It is host-only and test-mode-only, like `dev:setMinigames`, and test mode already shows a badge to everyone.

### ADR-071 · The Infect button disables itself only for reasons the client can prove · Accepted (Phase 7)
**Decision:** the button is disabled for cooldown, out of bounds, weak or stale GPS (all in the viewer's own view), and for "no one in range" only when the radar can show everybody who could be a target (`playerVisibility` is `all`, or `nearby` with `nearbyRadiusM ≥ infectionRadiusM`) and no crew-looking dot is within `infectionRadiusM`. In `regions` mode the radar is empty by design, so the button stays tappable and the server's `OUT_OF_RANGE` becomes a toast. It pulses when a dot is in range. A radar frame can lag the server by up to `radarIntervalMs`; the server is always the judge.
**Why:** UI_UX asks for a disabled button with its reason, but a button that is wrongly disabled is worse than one that says "no one is close enough".
