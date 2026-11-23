import type { TaskContext } from './types';

/** A plain task context for game tests: time zero, no key held. */
export const CTX: TaskContext = { gameMs: 0, keyHeld: false };
