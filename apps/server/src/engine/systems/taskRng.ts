/** Seeded randomness for task rolls: ids, sections, points, types and co-op partners. Pure. */
import { createRng, hashSeed, ID_ALPHABET, type Rng } from '@afterdark/shared';

import type { RoomState } from '../state';

const TASK_ID_LENGTH = 16;

/** A fresh RNG for one roll. Counting the rolls keeps the game reproducible from the secret seed. */
export function taskRng(state: RoomState): Rng {
  const game = state.game;
  if (!game) throw new Error('taskRng: no game');
  return createRng(hashSeed(`${state.secretSeed}|task|${game.taskSeq++}`));
}

export function newTaskId(rng: Rng): string {
  let id = '';
  for (let i = 0; i < TASK_ID_LENGTH; i++) id += ID_ALPHABET[rng.int(0, ID_ALPHABET.length - 1)];
  return id;
}
