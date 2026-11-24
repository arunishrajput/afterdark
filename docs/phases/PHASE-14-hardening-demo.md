# Phase 14: Hardening, Final Tuning and Demo Readiness

**Goal:** make AfterDark robust and presentable. A security pass, rate and size limits, an anti-spoof review, a full regression suite, a load test, the final field-test tuning, a complete README, and a hackathon demo script. Ship **v1.0.0**.

**Depends on:** Phase 13.

**Read first:**
- [ARCHITECTURE.md §10–11](../ARCHITECTURE.md)
- [PRD.md §7, §9, §10](../PRD.md)
- [reference/INFILTR8_NOTES.md](../reference/INFILTR8_NOTES.md) (anti-cheat row)
- [TESTING.md](../TESTING.md)
- [MANUAL_SETUP.md › Phase 14](../MANUAL_SETUP.md#phase-14-demo-day)
- PROGRESS.md field-test notes (all of them)

**Skills to use:** `security-and-hardening` (consider the `agent-skills:security-auditor` agent **only if the human asks**), `performance-optimization`, `code-review-and-quality`, `code-simplification`, `shipping-and-launch`, `documentation-and-adrs`.

## Scope
- **In:** security fixes, limits, anti-spoof refinements, regression and load tests, field-test fixes and tuning, docs, demo script, release.
- **Out:** new features. Anything new goes into the PROGRESS backlog for after the hackathon.

## Tasks
- [x] **14.1 Security review:** walk the OWASP-style checklist against this codebase:
  - input validation on every handler (zod; fuzz a few with junk payloads)
  - username sanitising
  - helmet and CSP
  - CORS same-origin only
  - no secrets or tokens in logs
  - `dev:*` gating (testMode + `ALLOW_TEST_MODE`)
  - session token entropy and the replace logic
  - DoS: Socket.IO `maxHttpBufferSize` 16 KB, per-socket rate limits (`loc:update` 2/s, others 10/s), lobby creation limit per IP (5/min), and a cap on total lobbies (200)

  Fix what you find and add tests.
- [ ] **14.2 Anti-spoof review:** check the speed gate, the re-anchor logic and accuracy gating. Log repeated teleports per player, privacy-safely (counts only). Consider a "suspicious GPS" indicator for the host only, but only if it can't leak roles; otherwise leave it out and record an ADR.
- [ ] **14.3 Regression:**
  - e2e suite: a full 8-player game (1–2 browser contexts + bots) covering lobby → setup → spawn → reveal → tasks → infection → meeting → abilities → co-op → results → play again
  - run it 3 times to catch flakiness, and fix any flaky test
  - extend the raw-frame leak scan to the full game
- [ ] **14.4 Load test:** `pnpm bots:load --lobbies 20 --players 8` against a local production build, then (briefly, if the free plan allows) against Render. Measure tick time (≤ 5 ms per room), memory, and the 95th-percentile view latency. Record the results in PROGRESS and fix hotspots.
- [ ] **14.5 Field-test fixes:** go through every PROGRESS field-test note. Fix 🔴 and 🟠 items. Tune `infectionRadiusM`, `reachRadiusM`, `sectionEntryHoldS`, the meeting durations and similar values from real data, with an ADR for each.
- [ ] **14.6 Code quality pass:** run `code-review-and-quality` and `code-simplification` across the engine and views. Remove dead code. Make sure every system file is under about 400 lines (split if not).
- [ ] **14.7 Docs:**
  - README: pitch, screenshots, how to play, run locally, test, deploy, architecture diagram link, credits (OSM/CARTO), licence choice (ask the human)
  - check that every doc in `docs/` matches the final code (CONFIG and PROTOCOL especially)
- [ ] **14.8 Demo script** (`docs/DEMO.md`): a 3-minute judge demo.
  1. The pitch (20 s).
  2. The host draws an area around the venue on a phone (30 s).
  3. Test mode + 6 bots (`dev:addBots`), with the projector showing one crew phone and one imposter phone (laptop browsers in sim mode).
  4. Show the directional task reveal, a minigame, an infection with the boxes filling, a meeting and vote, and the results.

  Include the fallback plan (pre-recorded GIF, local server) and the pre-demo checklist (warm Render, battery, hotspot).
- [ ] **14.9 Release:** update the CHANGELOG (from the tags), bump the version to 1.0.0, tag `v1.0.0` and `phase-14-done`, push, and confirm the deploy plus the prod smoke test.

## Acceptance criteria
- No known high-severity security issue. Limits are enforced and tested.
- Full regression and leak scans are green 3 times in a row. The load test meets the budget.
- Field-test blockers are resolved. The defaults are tuned with ADRs.
- The README and DEMO.md are complete. v1.0.0 is deployed and passes the smoke test.

## Verification
```
pnpm verify && pnpm e2e && pnpm bots:load --lobbies 20 --players 8
BASE_URL=<prod> pnpm exec playwright test e2e/prod-smoke.spec.ts
```

## Manual steps for the human
- A final field test with a real group (ideally 6–8 people). Paste the notes **before** this session if possible.
- Choose a licence (MIT is suggested) when asked.
- Demo-day steps in MANUAL_SETUP › Phase 14.

## Docs to update
README.md, docs/DEMO.md (new), CHANGELOG.md (new), CONFIG.md, DECISIONS.md, PROGRESS.md (project complete, backlog for after the hackathon).
