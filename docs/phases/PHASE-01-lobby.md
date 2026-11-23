# Phase 01: Lobby System

**Goal:** players create or join lobbies by code with a username and an accepted safety notice, see the live roster, ready up and get an auto-start countdown. Reconnect, host hand-over and kick all work. The per-player view projection and the leak-test harness exist from day one.

**Depends on:** Phase 0.

**Read first:**
- [RULES.md §1, §3](../RULES.md#3-lobby)
- [PROTOCOL.md](../PROTOCOL.md) (conventions + Phase 1 events)
- [ROLES.md › Visibility matrix](../ROLES.md#visibility-matrix)
- [ARCHITECTURE.md §3, §4, §6, §7](../ARCHITECTURE.md)
- [UI_UX.md §2](../UI_UX.md#2-screens) (Home, Join, Lobby)
- [TESTING.md §3](../TESTING.md#3-leak-tests-mandatory-from-phase-1)

**Skills to use:** `api-and-interface-design`, `test-driven-development`, `incremental-implementation`, `frontend-ui-engineering`.

## Scope
- **In:** lobby lifecycle, sessions, roster UI, ready and countdown (the countdown ends in a placeholder "starting" phase), config patching (generic, no map), host hand-over, kick, leave, idle cleanup, view projection and leak harness, safety notice.
- **Out:** location (in this phase "ready" does not need a fix; Phase 2 adds that), map, game start.

## Tasks
- [x] **01.1 Shared protocol.** In `protocol/events.ts` and `protocol/schemas.ts`, add `Ack`, `ErrorCode` and every Phase 1 event from PROTOCOL.md with zod schemas. Add `types/domain.ts` (Player, Lobby, Phase) and `types/view.ts` (`PlayerView` lobby subset).
  - *Accept:* schema tests cover valid and invalid usernames (length, charset `[\p{L}\p{N} _.-]`, trimming) and codes.
- [x] **01.2 Lobby code generator.** 6 characters from the CONFIG alphabet, using the seeded RNG for tests and crypto in prod, with no collisions among live lobbies.
- [x] **01.3 Engine: lobby state and reducer** (`engine/state.ts`, `engine/systems/lobby.ts`), pure, with the injected clock. Commands:
  - create
  - join: phase check, max 12, unique name case-insensitively, `acceptedSafety` must be true
  - leave
  - setReady
  - updateConfig: host only; validate the patch against the config schema; **un-ready everyone**
  - kick: host only; ban the token for this lobby

  Plus:
  - host hand-over to the earliest-joined connected player
  - countdown: when everyone is ready and there are ≥ 4 players, set `countdownEndsAt = now + 5s`; any un-ready cancels it; when it expires, move to the placeholder phase `starting`
  - TDD for every rule in RULES §3
- [x] **01.4 Rooms.** `RoomManager` (create, find, delete idle lobbies after 30 min) and `Room` (serialised command queue, 1 Hz ticker, emitter).
- [x] **01.5 Sessions.** `lobby:create` and `lobby:join` return a token. `session:resume` re-binds. When a newer socket arrives for the same player, the old one gets `kicked {reason:'replaced'}`. Track the connected/disconnected flag.
- [x] **01.6 View projection.** `views/projectView.ts` builds the lobby part of `PlayerView` from an allow-list. The emitter hashes each view and sends only changed views, throttled to 200 ms. Add `event` emission for `lobby.countdown`.
- [x] **01.7 Leak-test harness.** Write `views/leak.test.ts` with the `keysDeep` helper and the fixture builder. For now it asserts that views contain no tokens or other players' secrets (tokens must **never** appear in any view). Later phases extend it.
- [x] **01.8 Socket gateway.** Handlers validate with zod, map to commands, and send acks with error codes. Add a basic per-socket rate limit (10 events/s).
- [x] **01.9 Client store and net.** The Zustand store holds view, connection and clock offset (from `time:ping`, median of 5). Persist `{token, code}` in localStorage, wrapped in try/catch. Auto-resume on connect.
- [ ] **01.10 Client screens.**
  - **Home:** Create / Join, `?code=` prefill, How-to-play placeholder.
  - **Join/Create:** username plus the safety notice checkbox, with the text from PRD §8.
  - **Lobby:**
    - large code with copy and share buttons (Web Share API, falling back to copy)
    - QR code using a small library such as `qrcode`
    - roster with ready ✓, host 👑 and connection state
    - Ready toggle and countdown overlay
    - host: kick buttons and a generic settings drawer (play time, target, imposter count, meetings per player) using the config schema
    - Leave button
  - Neutral theme. Make it mobile-first.
- [ ] **01.11 Integration test.** 8 `socket.io-client` clients against the in-process server: create, join ×7, all ready, countdown fires; one disconnects and resumes and keeps its identity; the host leaves and host status moves; a duplicate name is rejected; a 13th join gets `LOBBY_FULL`.
- [ ] **01.12 E2E.** Playwright with 3 browser contexts: create, join by code, ready all, see the countdown. Then reload one context and confirm it is still in the lobby.
- [ ] **01.13 Wrap up.** Update the docs (PROTOCOL if events changed, PROGRESS). Commit, tag, push.

## Acceptance criteria
- Joining, ready and roster changes reach every client within 500 ms locally.
- A reload restores the same player. A second tab for the same session replaces the first.
- Host hand-over and kick work. A kicked token can't rejoin.
- A config change un-readies everyone.
- No view ever contains a token (leak test).
- Unit, integration and e2e tests are green. CI is green.

## Verification
```
pnpm verify && pnpm e2e
```
Manually: `pnpm dev`, then two browser windows, one of them a private window.

## Manual steps for the human
None.

## Docs to update
PROTOCOL.md (if any change), PROGRESS.md, DECISIONS.md (new choices, if any).
