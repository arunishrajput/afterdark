# Changelog

AfterDark was built in 15 phases ([docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)). Every phase ended with a `phase-NN-done` tag; the full story of each is in [PROGRESS.md](PROGRESS.md) › Session log, and every design choice in [docs/DECISIONS.md](docs/DECISIONS.md). Versions follow [Semantic Versioning](https://semver.org/).

## Unreleased
- **Trailer:** a 60-second cinematic trailer, [on YouTube](https://www.youtube.com/watch?v=U6HoX-31tbk), with its Remotion source in [`trailer/`](trailer/README.md): hand-animated shots on a real street map of Connaught Place, New Delhi, live minigames, an infection, a sabotage, a meeting and an ejection, an original score synthesized in code with sound design on every cut, and a new thumbnail. It replaces a first cut from the same day. Standalone, so it is not part of `pnpm verify`.
- **Logo:** the creator's AfterDark logo replaces the crescent-and-eye everywhere: app icons, favicon, the Home hero and the lobby header, all rendered from one master by `pnpm icons` (ADR-111).
- **Home:** a hero page with the logo, a one-line pitch and the game's facts, the live night map beside it on laptops, and "How a game goes" below the fold (ADR-110). The How to play infection picture shows its infected dot again.

## [1.0.0] · 2026-11-24 · `v1.0.0`, `phase-14-done`
Hardening, final checks and demo readiness.
- **Security:** lobby creation is limited to 5 a minute per client address and 200 lobbies per server (new error code `SERVER_BUSY`, ADR-107); junk payloads to every client event are fuzzed over real sockets; every minigame and the co-op PIN are fuzzed with hostile bodies; every `dev:*` event is proven refused without test mode.
- **Anti-spoof:** the speed check's time gap is bounded by the server clock, which closes a two-message teleport through a forged old timestamp; GPS re-anchors are counted per player and logged as counts (ADR-108).
- **Regression:** a full 8-player Playwright game through every system with a raw-frame leak scan of the crew player's traffic; the two flaky specs (no-go zone, Key Fetch) hardened; the whole suite green three times in a row.
- **Load:** `pnpm bots:load` (lobbies of hosting bots over real sockets, fix-to-view latency, server tick times, memory); results in PROGRESS.md.
- **Quality:** co-op upkeep split out of `coop.ts`, dead exports removed, a test that keeps `docs/CONFIG.md` equal to the code.
- **Docs:** README, [DEMO.md](docs/DEMO.md), MIT licence, this changelog; `E2E_SERVER_PORT` / `AFTERDARK_SERVER_URL` when port 3000 is taken.

## UI/UX pass · 2026-11-24 (between phases 13 and 14)
From the creator's first phone test: a full-screen game map with a floating HUD and a collapsible sheet, co-op waiting on the task card, a map view during a meeting's gather, no sideways overflow on Chrome Android, no truncated text (ADR-103 to 106).

## Phase 13 · PWA and mobile polish · `phase-13-done`
Installable PWA (manifest, icons, offline shell, update banner queued to quiet screens), reconnect banner and resume checks, battery-saving location sends, sound kit and mute toggle, How to play, self-hosted fonts and lazy screens (initial JS 120 KB gzipped; Lighthouse mobile 87 / 100 / 96 / 100). ADR-099 to 102.

## Phase 12 · Results and replay · `phase-12-done`
The event log, distance walked, the results screen (who was who, score chart, leaderboard and awards, timeline, meeting history), Play again into the same lobby. ADR-095 to 098.

## Phase 11 · Remaining minigames and balance · `phase-11-done`
Sliding Puzzle, Mini Crossword, Pattern Memory, Signal Decode and Key Fetch; the Minigame variety setting; `pnpm bots:simulate` and the tuned defaults (52% imposter wins at 8 players, median 15 minutes). ADR-090 to 094.

## Phase 10 · Co-op tasks and Camouflage · `phase-10-done`
Co-op PIN Relay between two players, the Camouflage ability (an imposter's phone reads as crew), stand-in partners, recovery on co-op completion. ADR-083 to 089.

## Phase 9 · Abilities: Saboteur and Phantom · `phase-09-done`
The ability framework, Task Stop (systems jammed for everyone) and Fake Task (a planted pin that pays nothing). ADR-078 to 082.

## Phase 8 · Meetings and voting · `phase-08-done`
Emergency meetings (alarm, gather at the Base, discuss, vote, result), ejection with the role revealed, spectators, the game clock frozen during meetings. ADR-072 to 077.

## Phase 7 · Infection · `phase-07-done`
Infect by proximity with a channel and gap tolerance, exposure and incubation, the public infection boxes, the imposter win. ADR-067 to 071.

## Phase 6 · Deploy and first field test · `phase-06-done`
Production serving (helmet CSP, compression, cache rules), same-origin WebSocket, graceful shutdown, the Render deploy and its smoke test. ADR-065, 066.

## Phase 5 · Task engine and first minigames · `phase-05-done`
Three-stage task reveal (direction → section → pin), Wires and Lock, rerolls and unsafe reports, team and personal score, the crew win. ADR-058 to 064.

## Phase 4 · Game start · `phase-04-done`
The state machine (lobby → spawning → reveal → playing → ended), spawns, secret roles and tags, hold-to-reveal, the HUD, zone penalties, host controls, in-process and CLI bots. ADR-050 to 057.

## Phase 3 · Regions, sections and task points · `phase-03-done`
Region partition, the 9-section compass, the task-point pool, no-go zones, the Base, visibility modes, the setup wizard. ADR-044 to 049.

## Phase 2 · Map, location and boundary · `phase-02-done`
Live location with speed and accuracy checks, the host-drawn boundary, the radar, the settings sheet, the GPS simulator. ADR-039 to 043.

## Phase 1 · Lobby · `phase-01-done`
Create, join, ready, kick, reconnect with session tokens, the allow-list view and the leak-test harness. ADR-034 to 038.

## Phase 0 · Setup · `phase-00-done`
The pnpm monorepo, strict TypeScript, ESLint and Prettier, shared config and RNG, an Express + Socket.IO server, a React client, Playwright, CI. ADR-030 to 033.
