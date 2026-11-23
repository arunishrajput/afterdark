/**
 * The minigame framework (TASKS §3). A game is one `MinigameDef`: the server
 * generates the puzzle and keeps the solution, the client only renders the
 * puzzle and sends answers. Nothing here knows about rooms or sockets.
 */
import type { z } from 'zod';

import type { GameConfig } from '../config/schema';
import type { Rng } from '../rng';

/** Every minigame type (SCORING.md). `coop_pin` is co-op (Phase 10); the rest are solo. */
export const MINIGAME_TYPES = [
  'wires',
  'lock',
  'pattern',
  'signal',
  'slide',
  'crossword',
  'keyfetch',
  'coop_pin',
] as const;
export type MinigameType = (typeof MINIGAME_TYPES)[number];

/** The types a solo task can roll. */
export const SOLO_MINIGAME_TYPES = [
  'wires',
  'lock',
  'pattern',
  'signal',
  'slide',
  'crossword',
  'keyfetch',
] as const;
export type SoloMinigameType = (typeof SOLO_MINIGAME_TYPES)[number];

/** v1 uses difficulty 1 everywhere; the field is kept for tuning later. */
export type Difficulty = 1 | 2 | 3;

/** The tunable numbers a generator may read (CONFIG: Tasks). */
export type MinigameParams = Pick<
  GameConfig,
  'wiresPairs' | 'lockDigits' | 'lockDigitMax' | 'lockMaxGuesses'
>;

/**
 * `P` puzzle (sent to the client), `S` solution (server only), `A` the final
 * answer, `Act` a mid-game action, `F` the feedback an action returns, `St` the
 * server-side progress of a multi-step game.
 */
export interface MinigameDef<P, S, A, Act = never, F = never, St = never> {
  type: SoloMinigameType;
  generate(rng: Rng, difficulty: Difficulty, params: MinigameParams): { puzzle: P; solution: S };
  /** `state` is the progress `act` built up: a game can refuse an answer that skipped its steps. */
  verify(puzzle: P, solution: S, answer: A, state: St | undefined): boolean;
  /** Multi-step games only. May swap in a new `solution` (the lock re-rolls its code). */
  act?(
    puzzle: P,
    solution: S,
    state: St | undefined,
    action: Act,
    rng: Rng,
  ): { state: St; feedback: F; solution?: S };
  answerSchema: z.ZodType<A>;
  actionSchema?: z.ZodType<Act>;
}

export type CheckResult = 'right' | 'wrong' | 'invalid';

/** A game with its types erased, so the server can hold many kinds in one registry and parse untrusted input itself. */
export interface ErasedMinigame {
  type: SoloMinigameType;
  hasActions: boolean;
  generate(
    rng: Rng,
    difficulty: Difficulty,
    params: MinigameParams,
  ): { puzzle: unknown; solution: unknown };
  /** `invalid` when `answer` is not shaped like this game's answer (it never reaches `verify`). */
  check(puzzle: unknown, solution: unknown, answer: unknown, state: unknown): CheckResult;
  act(
    puzzle: unknown,
    solution: unknown,
    state: unknown,
    action: unknown,
    rng: Rng,
  ): { state: unknown; feedback: unknown; solution?: unknown } | 'invalid';
}

/**
 * Erases a definition. The casts are the one place the server trusts that a
 * stored puzzle, solution and state came from the same game's own `generate`
 * and `act`; answers and actions are always parsed with the game's schema.
 */
export function eraseMinigame<P, S, A, Act, F, St>(
  def: MinigameDef<P, S, A, Act, F, St>,
): ErasedMinigame {
  return {
    type: def.type,
    hasActions: def.act !== undefined && def.actionSchema !== undefined,
    generate: (rng, difficulty, params) => def.generate(rng, difficulty, params),
    check: (puzzle, solution, answer, state) => {
      const parsed = def.answerSchema.safeParse(answer);
      if (!parsed.success) return 'invalid';
      return def.verify(puzzle as P, solution as S, parsed.data, state as St | undefined)
        ? 'right'
        : 'wrong';
    },
    act: (puzzle, solution, state, action, rng) => {
      if (!def.act || !def.actionSchema) return 'invalid';
      const parsed = def.actionSchema.safeParse(action);
      if (!parsed.success) return 'invalid';
      return def.act(puzzle as P, solution as S, state as St | undefined, parsed.data, rng);
    },
  };
}
