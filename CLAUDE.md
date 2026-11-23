# AfterDark: Claude Code Guide

AfterDark is a real-world GPS social-deduction PWA (Among Us played on your feet). Crew walk to hidden task spots and solve minigames. Imposters secretly infect players and sabotage. Everyone meets face to face to vote. **Claude Code writes all of the code**: no human teammate codes. The work is split into phases, **one phase per session**.

## "Start the next phase": the session protocol
When the user says **"Start the next phase"** (or "continue", or "resume"):
1. **Orient.** Read `PROGRESS.md`. If a phase is `◐ IN PROGRESS`, resume it at its recorded task. Otherwise take the phase marked `▶ NEXT`.
2. **Load context.** Read `docs/BUILD_PLAN.md`, then `docs/phases/PHASE-NN-*.md`, then **only** the docs listed in that file's "Read first". Read other docs only when a question comes up.
3. **Baseline.** `git pull --ff-only`, confirm `git status` is clean, then `pnpm install && pnpm verify`. If the baseline is red, fix it first and commit the fix separately. (Skip this step for Phase 0, which has no code yet.)
4. **Triage.** If PROGRESS.md › Field-test notes or Known issues has unresolved 🔴 items, fix them first, with tests. Move 🟠/🟢 items to the backlog unless they're cheap and in scope.
5. **Start.** Mark the phase `◐ IN PROGRESS` in PROGRESS.md with today's date and commit (`docs(progress): start phase NN`).
6. **Build.** Work through the phase checklist **in order**:
   - logic: write the test first (TDD); UI: build it, then verify with Playwright
   - **one commit per task** (`feat(server): …`, `test(shared): …`, `fix(client): …`)
   - tick each checkbox in the phase file as you go
7. **Verify.** Prove every acceptance criterion with evidence: test output, `pnpm verify`, `pnpm e2e`, bot runs, Playwright MCP screenshots. "Looks right" is not evidence.
8. **Document.** Update `PROGRESS.md`: status ✅, a session log entry, what was built, deviations, known issues, **handoff notes for the next session**, and manual steps for the human. Record every new decision in `docs/DECISIONS.md`. Update any spec the code changed (CONFIG, PROTOCOL, RULES, TASKS…). **Docs must match the code.**
9. **Ship.** `git add -A && git commit -m "docs(progress): complete phase NN"`, then `git tag -a phase-NN-done -m "Phase NN done"` (annotated: `--follow-tags` skips lightweight tags), then `git push --follow-tags`, and confirm with `git ls-remote --tags origin`. Check CI (`gh run watch`) and fix anything red.
10. **Hand off.** End with a short summary, numbered manual steps for the human (if any), and: **"Run /clear, then type: Start the next phase"**.

### Guardrails
- **One phase per session.** Never start the next phase, even if there's time left. Suggest optional polish instead.
- **Checkpoint if the session is running long.** If context is running low or a phase is too big: stop at a clean, green point, record `◐ IN PROGRESS, resume at task NN.k` plus notes in PROGRESS.md, commit and push. The next session continues from there.
- **Blocked on the human?** Write numbered, beginner-friendly steps in PROGRESS.md › Manual actions, push, and stop. Use AskUserQuestion for decisions that only the user can make: repo name, licence, product choices not covered by the docs.
- **Design authority.** The creator wants Claude to choose the better design where the docs are silent or weak. Decide, record an ADR, and mention it in the hand-off. Never silently change an established rule.

## Doc map (sources of truth)
| Need | File |
|---|---|
| Progress, next phase, handoff notes | `PROGRESS.md` |
| Phase list and Definition of Done | `docs/BUILD_PLAN.md`, `docs/phases/` |
| **Rules (authoritative)** | `docs/RULES.md` |
| Every number | `docs/CONFIG.md`, mirrored by `packages/shared/src/config/defaults.ts` |
| Roles, classes, **visibility matrix** | `docs/ROLES.md` |
| Points and win math | `docs/SCORING.md` |
| Regions, sections, task points, visibility modes | `docs/MAP_AND_REGIONS.md` |
| Minigames and task lifecycle | `docs/TASKS.md` |
| Meetings and voting | `docs/MEETINGS.md` |
| Socket events and view shapes | `docs/PROTOCOL.md`, mirrored by `packages/shared/src/protocol/` |
| System design | `docs/ARCHITECTURE.md` |
| Screens, themes, copy | `docs/UI_UX.md` |
| Tests, simulator, bots, field tests | `docs/TESTING.md` |
| Human-only steps | `docs/MANUAL_SETUP.md` |
| Why things are the way they are | `docs/DECISIONS.md`, `docs/CONCEPT.md`, `docs/reference/INFILTR8_NOTES.md` |

## Stack
pnpm monorepo, TypeScript (strict).
- `apps/client`: Vite + React + Tailwind + Zustand + react-leaflet + Leaflet-Geoman + vite-plugin-pwa. Map tiles: OSM, darkened in CSS (ADR-039).
- `apps/server`: Node + Express + Socket.IO. Authoritative, in-memory, pino logs.
- `packages/shared`: types, zod schemas, config, turf-based geo, seeded RNG, minigames.
- `tools/bots`: the bot CLI. `e2e/`: Playwright. Deploy: Render (one web service).

## Commands (available after Phase 0)
| Command | Purpose |
|---|---|
| `pnpm dev` | Server :3000 + client :5173, with a proxy for `/socket.io` |
| `pnpm verify` | lint + typecheck + test + build. Must be green before ending a phase. |
| `pnpm test` / `pnpm e2e` | Vitest / Playwright |
| `pnpm bots -- --code ABC123 --count 7` | Bot players (Phase 4+) |
| `pnpm tunnel` | HTTPS tunnel for testing on a real phone |

## Invariants (never break)
1. **The server is authoritative.** Every rule, timer, random roll and win check lives in the server engine. The client only displays and sends intents.
2. **Validate every inbound message with zod** before any logic runs.
3. **Need to know.** Views are built per player with `projectView()` from an allow-list (ROLES.md visibility matrix). No spreading of server objects into payloads. No room broadcasts of private data. **Every new view field gets a leak-test assertion.**
4. **Crew views must have the same structure** whether the player is healthy, exposed or infected. Fake and real tasks must have the same structure.
5. **The engine is pure.** No `Date.now()`, `Math.random()` or I/O in `engine/` or `views/`. Inject the clock and RNG.
6. **Every number comes from `shared/config`.** No magic numbers. Keep `docs/CONFIG.md` in sync.
7. **Game time** (pausable) drives the match clock, cooldowns, incubation, co-op expiry and lock time.
8. **Never log** coordinates, tokens or secret roles. Positions live in memory only.
9. **Do not add** a kill mechanic, in-app chat or voice, room or camera scanning, accounts, or a database unless an ADR approves it.
10. **Safety first.** Never write copy telling players to run, and never place tasks or spawns in no-go zones.

## Code conventions
- TypeScript strict. No `any`. Prefer named exports. Keep files small (< ~400 lines), with one system per file in `engine/systems/`.
- Tests sit next to the code (`*.test.ts`). Integration tests go in `apps/server/test/`. Use a seeded RNG and a fake clock in tests.
- React: function components and hooks, lazy-loaded minigames, theme through `data-theme` on `<html>` (`crew`, `imposter`, `neutral`).
- Commits follow Conventional Commits (`feat|fix|test|docs|refactor|chore(scope): …`). Work on `main`. Tag each phase `phase-NN-done`.
- Check current docs for library APIs (skill `source-driven-development`) rather than relying on memory.
- Commit messages and PR bodies end with the attribution line from the system reminder, if one is present.
