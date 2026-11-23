# Tasks and Minigames

Rules are in [RULES.md](RULES.md#6-playing-crew). Points are in [SCORING.md](SCORING.md). Geometry is in [MAP_AND_REGIONS.md](MAP_AND_REGIONS.md). Numbers are in [CONFIG.md](CONFIG.md).

## 1. Task lifecycle
```
ASSIGNED ──(enter section, 3 s hold)──▶ PIN_REVEALED ──(within 15 m)──▶ AT_PIN ──open──▶ IN_PROGRESS
   │                                                                                     │
   │                                                    submit ok ──▶ COMPLETED (points / "fooled")
   │                                                    wrong ──▶ IN_PROGRESS (3 s lockout)
   │                                                    leave >25 m / Task Stop / meeting ──▶ AT_PIN or PIN_REVEALED (progress reset)
   └── reroll / report / expire (co-op) / partner gone ──▶ REMOVED (slot refills)
```
- **ASSIGNED:** the client receives `{taskId, regionName, section, kind: 'solo'|'coop', partnerTag?}`. **Nothing else.** No coordinates, no minigame type, no points.
- **PIN_REVEALED:** the client also receives `{lat, lng}`.
- **AT_PIN:** the server allows `task:open`. The reply contains the minigame type, the points and the **puzzle payload**, but **never the solution**.
- **Payload rule:** fake tasks must produce payloads with exactly the same structure as real ones, using the same ID format and the same field set. Only the reply to `task:submit` differs (`result: 'fooled'`).

## 2. Slots and assignment
- Each crew member has `taskSlots` (3) **own slots**. When a slot empties, it refills straight away:
  1. If the fake queue isn't empty, the slot gets the oldest queued fake.
  2. Otherwise, with probability `coopChance` (25%), a **co-op** task, if an eligible partner exists (see §4).
  3. Otherwise, a **solo** task. The minigame type is chosen by weight from the enabled types (default weights: wires 3, lock 3, pattern 3, signal 2, slide 2, crossword 2, keyfetch 1). The type is hidden until AT_PIN.
- The target section and point are chosen as described in [MAP_AND_REGIONS.md §4](MAP_AND_REGIONS.md#4-task-point-pool).
- A player never holds two tasks at the same point.

## 3. Minigame framework
Each minigame lives in `packages/shared/src/minigames/<type>.ts` and exports one definition:
```ts
interface MinigameDef<P, S, A, Act = never, F = never> {
  type: MinigameType;
  generate(rng: Rng, difficulty: 1 | 2 | 3, params: MinigameParams): { puzzle: P; solution: S }; // server only
  verify(puzzle: P, solution: S, answer: A, state: St | undefined): boolean;   // server only
  act?(puzzle: P, solution: S, state: St | undefined, action: Act, rng: Rng):
    { state: St; feedback: F; solution?: S };                                  // optional multi-step games; may swap the solution
  answerSchema: ZodType<A>;
  actionSchema?: ZodType<Act>;
}
```
(`MinigameParams` carries the tunable sizes: `wiresPairs`, `lockDigits`, `lockDigitMax`, `lockMaxGuesses`. The server erases the types with `eraseMinigame` and parses every answer and action with the game's own schema; a malformed one is `INVALID_PAYLOAD`. ADR-062.)
- The server generates the puzzle on `task:open`, stores the solution in the task's server state, and sends only `puzzle`.
- Multi-step games such as the lock use `task:action` for feedback.
- Client renderers live in `apps/client/src/components/minigames/<Type>.tsx`, all following the same `{puzzle, onSubmit, onAction, disabled}` interface (`onAction` resolves with the server's feedback). Each is lazy-loaded when a task of its type opens.
- Every game must:
  - work with one hand, with tap targets of at least 44 px
  - avoid colour-only cues (use shapes and labels too)
  - fit within ~90 s
  - show clear success and failure feedback
- Bots solve puzzles with `solve()` helpers that live **only in test code** (`tools/bots`, test files), never in the client bundle.

## 4. Catalog
| Type | Name | Players | Points | How it works | Answer the server checks |
|---|---|---|---|---|---|
| `wires` | Wire Connect | Solo | 4 | 4 coloured wire ends on the left and 4 on the right, shuffled; each side has a symbol as well as a colour. Drag to connect matching pairs. | Mapping `left→right` equals the solution. Both ends of a wire share colour **and** symbol. v1 is tap-to-pair, not drag (ADR-063). |
| `lock` | Lock Breaker | Solo | 5 | Guess a 3-digit code using digits 0–5. Each guess (`task:action`) returns "correct place" and "correct digit, wrong place" counts. You have 8 guesses; after that the lock re-rolls and you start again. | The final guess equals the code **and** an earlier `task:action` guess matched it (ADR-062: no blind submits). A malformed guess costs nothing. |
| `pattern` | Pattern Memory | Solo | 5 | A 3×3 pad flashes a sequence 5 steps long; repeat it. | Sequence matches |
| `signal` | Signal Decode | Solo | 6 | A short word (4–5 letters) is shown as symbols with a partial key. Fill in the rest. | Decoded word matches |
| `slide` | Sliding Puzzle | Solo | 7 | 3×3 tile puzzle shuffled with 20–30 random legal moves, so it is always solvable. | The submitted move list, replayed on the server, solves it |
| `crossword` | Mini Crossword | Solo | 8 | A 3×3 or 4×4 mini crossword from a curated bank (≥20 puzzles in `shared/minigames/data/crosswords.ts`) with across and down clues. | Grid equals the solution (case-insensitive) |
| `keyfetch` | Key Fetch | Solo | 12 | **Two points.** The task card shows a direction to Point 1. At Point 1, hold "Pick up key" for 3 s (`task:action`). Point 2 is then assigned at least `keyFetchMinLegM` (60 m) away, in another section, with its own Stage 1 and Stage 2 reveal. At Point 2, a short "turn the key" interaction (the right rotation sequence) completes it. | Key held, plus the rotation answer |
| `coop_pin` | PIN Relay | Co-op | 12 (6 + 6) | Both players at the pin. Each phone shows a 4-digit PIN that the *other* player must type in. Both entries must be correct. | Both PINs match |

**Difficulty:** in v1 everything uses difficulty 1. The field is kept for later tuning.

**Key Fetch and Task Stop:** a key already picked up is **kept** through Task Stop and meetings. Only the final interaction at Point 2 resets.

**Implemented in Phase 5:** `wires` and `lock` (`minigamesEnabled`); the registry is `packages/shared/src/minigames/index.ts`. A task's type is rolled when the task is assigned and kept on the server until `task:open`.

## 5. Co-op tasks
1. **Generation:** when a crew member A's slot rolls co-op, pick partner B uniformly at random from active, connected players other than A, crew or imposter. B must not already hold a partner task, and must not be A's partner on another co-op task. If nobody is eligible, a solo task is generated instead.
2. **The partner slot:** each player can hold **at most 1 partner co-op task**, in addition to their own slots. For crew this is a fourth card marked "Requested by a teammate". For imposters it is their only kind of task. The task occupies one of A's own 3 slots.
3. **Cards:** A sees "Co-op: find **`<B's tag>`** · NE of Region B", and B sees the same with A's tag. Both get Stage 1 and Stage 2 reveals. Both must be AT_PIN.
4. **Session:** the first player to tap "Start co-op" at the pin opens a **waiting** session that lasts until expiry. The second participant joins with `coop:join` when within `reachRadiusM` (15 m). The minigame starts once both have joined. Leaving the reach radius by more than 10 m resets the session to waiting.
5. **Who can join a waiting session:**
   - the assigned partner
   - **or** any camouflaged imposter (RULES §7.4) who is at the pin while the assigned partner has not joined

   Once a second participant has joined, nobody else can.
6. **When it completes,** crediting follows [SCORING.md](SCORING.md#co-op-crediting): the team always gets +12. If a camouflaged imposter stood in, the assigned partner's copy closes as "Co-op task expired".
7. **Expiry:** after `coopExpiryS` (360 s of game time) without completion, both copies are removed with "Co-op task expired", and A's slot refills. It also expires if a participant is ejected or disconnects for more than `forfeitAfterS` (180 s).
8. **Cooldown recovery** for imposters: see RULES §7.5.

## 6. Interruptions
Implemented in Phase 5 (ADR-061): leaving the pin (> `reachRadiusM + taskAbandonExtraM`), a stale fix, zone lock and a disconnect (a `task.reset` event with the reason); weak GPS keeps an open minigame but blocks reveals and opening (E5); the host pause rejects every task command. Task Stop (Phase 9) and meetings (Phase 8) reset and lock as the table says.

| Event | Effect on a minigame in progress | Effect on reveals | Effect on held keys |
|---|---|---|---|
| Task Stop | Reset (`task.reset` reason `sabotage`); can't open, play or submit for `taskStopLockS` | Kept | Kept |
| Meeting called | Reset; task actions blocked until the meeting ends | Kept | Kept |
| Host pause | Frozen (no input accepted) | Kept | Kept |
| Player leaves the pin (>25 m) | Reset | Kept | Kept |
| Player goes stale or out of bounds | Reset | Kept | Kept |
| Disconnect, then reconnect | Reset | Kept | Kept |

## 7. Fake tasks (Phantom)
**Phase 9 notes (ADR-078):** a fake's id is made when it is planted (same 16-symbol format as any task id) and kept when a slot takes it, so the Phantom's `fakes[].id` is the card's id. The server keeps the planter on the task (`fakeOwnerId`, never projected) so the Phantom's count falls when the task is completed, rerolled, reported or its holder is ejected. Distance rules: at least `fakeTaskMinPointDistanceM` (15 m, the reach radius) from every pool point and `fakeTaskMinDistanceM` (30 m) from any other fake.

- **Created by** `ability:fakeTask {lat, lng}`. The server validates it (inside the boundary, outside no-go zones, at least 30 m from other points and fakes) and works out `sectionOf`.
- **Delivered** by queue to the next crew slot that refills (§2), with a random solo minigame type other than `keyfetch`.
- **Played** exactly like a real task. On a correct submit, the result is `fooled`: the client shows the full-screen "You got fooled by a fake task!" overlay, nobody earns points, and the slot refills.
- **Removed** when completed, rerolled or reported. Each removal frees one of the Phantom's `fakeTaskMaxActive` (2).
