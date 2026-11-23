/**
 * Key Fetch (TASKS §4): the one two-point task. At Point 1 the player holds
 * "Pick up key" for `keyHoldS`; the engine then moves the card to Point 2
 * (it keeps the key through Task Stop, meetings and reconnects). At Point 2 the
 * player turns the key: a short left/right sequence shown on the key.
 *
 * The game only knows which leg it is (`ctx.keyHeld`) and checks the hold
 * against game time; moving the card is the engine's job (`taskPlay`).
 */
import { z } from 'zod';

import type { Rng } from '../rng';
import type { MinigameDef, MinigameParams } from './types';

export type KeyTurn = 'L' | 'R';

export interface KeyPuzzle {
  /** 1: pick the key up here. 2: turn the key here. */
  leg: 1 | 2;
  holdS: number;
  /** Leg 2: the rotation sequence to repeat. Empty on leg 1. */
  turns: KeyTurn[];
}

export type KeyTurns = KeyTurn[];

export type KeyAction = { step: 'grab' } | { step: 'pickup' };

export interface KeyFeedback {
  picked: boolean;
}

export interface KeyState {
  /** Game ms when the current grab began. */
  grabbedAtMs?: number;
}

const MS_PER_S = 1000;
const MAX_TURNS = 8;

export function generateKey(
  rng: Rng,
  params: Pick<MinigameParams, 'keyHoldS' | 'keyTurnSteps'>,
  keyHeld: boolean,
): { puzzle: KeyPuzzle; solution: KeyTurns } {
  if (!keyHeld) return { puzzle: { leg: 1, holdS: params.keyHoldS, turns: [] }, solution: [] };
  const turns = Array.from({ length: params.keyTurnSteps }, () => (rng.chance(0.5) ? 'L' : 'R'));
  // An all-same sequence is a weak "puzzle": make sure both directions appear.
  if (turns.every((t) => t === turns[0])) turns[turns.length - 1] = turns[0] === 'L' ? 'R' : 'L';
  return { puzzle: { leg: 2, holdS: params.keyHoldS, turns: [...turns] }, solution: turns };
}

export const keyfetch: MinigameDef<
  KeyPuzzle,
  KeyTurns,
  KeyTurns,
  KeyAction,
  KeyFeedback,
  KeyState
> = {
  type: 'keyfetch',
  generate: (rng, _difficulty, params, ctx) => generateKey(rng, params, ctx.keyHeld),
  verify: (puzzle, solution, answer) =>
    puzzle.leg === 2 &&
    answer.length === solution.length &&
    answer.every((t, i) => t === solution[i]),
  act: (puzzle, _solution, state, action, _rng, ctx) => {
    const held = state ?? {};
    // Leg 2 has nothing to pick up.
    if (puzzle.leg !== 1) return { state: held, feedback: { picked: false } };
    if (action.step === 'grab') {
      return { state: { grabbedAtMs: ctx.gameMs }, feedback: { picked: false } };
    }
    const grabbed = held.grabbedAtMs;
    const long = grabbed !== undefined && ctx.gameMs - grabbed >= puzzle.holdS * MS_PER_S;
    return { state: held, feedback: { picked: long } };
  },
  answerSchema: z.array(z.enum(['L', 'R'])).max(MAX_TURNS),
  actionSchema: z.discriminatedUnion('step', [
    z.strictObject({ step: z.literal('grab') }),
    z.strictObject({ step: z.literal('pickup') }),
  ]),
};
