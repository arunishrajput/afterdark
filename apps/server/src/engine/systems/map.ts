/** Boundary rules for the lobby (MAP_AND_REGIONS §1). Regions, points and the Base live in `setup.ts`. */
import { type BoundaryInput, validateBoundary } from '@afterdark/shared';

import type { RoomState } from '../state';
import { type Effect, RuleError } from '../types';
import { relayoutAfterBoundary } from './setup';

const sameRing = (a: readonly (readonly number[])[], b: readonly (readonly number[])[]) =>
  a.length === b.length && a.every((p, i) => p[0] === b[i]?.[0] && p[1] === b[i]?.[1]);

/**
 * Host sets the boundary. Anything that changes the setup un-readies everyone
 * (RULES §3.6); resending the same shape is a no-op.
 */
export function setBoundary(
  state: RoomState,
  playerId: string,
  input: BoundaryInput,
  effects: Effect[],
): void {
  if (state.phase !== 'lobby') throw new RuleError('WRONG_PHASE', 'Only possible in the lobby');
  if (state.hostId !== playerId) throw new RuleError('NOT_HOST', 'Only the host can do that');
  const res = validateBoundary(input, state.config);
  if (!res.ok) throw new RuleError('INVALID_PAYLOAD', res.message);
  if (state.boundary && sameRing(state.boundary.ring, res.ring)) return;
  state.boundary = { ring: res.ring, areaM2: res.areaM2 };
  relayoutAfterBoundary(state);
  for (const p of state.players) p.ready = false;
  effects.push({ kind: 'event', to: 'all', event: { type: 'lobby.mapChanged' } });
}
