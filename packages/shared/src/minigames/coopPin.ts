/**
 * PIN Relay (TASKS §5): the one co-op minigame. Two PINs are made; each player is
 * shown only the PIN they must **show**, and types the PIN their partner shows
 * them, in person. Nothing in a player's puzzle holds the PIN they must type,
 * so it cannot be solved alone. The server keeps both PINs.
 */
import { z } from 'zod';

import type { GameConfig } from '../config/schema';
import type { Rng } from '../rng';

export type CoopSlot = 'owner' | 'partner';

export type CoopPinParams = Pick<GameConfig, 'coopPinDigits'>;

/** Server-side only: both PINs. */
export interface CoopPins {
  owner: string;
  partner: string;
}

/** What one participant receives: the PIN to hold up for the other player. */
export interface CoopPuzzle {
  show: string;
  digits: number;
}

export interface CoopPinAnswer {
  pin: string;
}

const DIGIT_MAX = 9;

function rollPin(rng: Rng, digits: number): string {
  let pin = '';
  for (let i = 0; i < digits; i++) pin += String(rng.int(0, DIGIT_MAX));
  return pin;
}

export function generateCoopPins(rng: Rng, params: CoopPinParams): CoopPins {
  const owner = rollPin(rng, params.coopPinDigits);
  let partner = rollPin(rng, params.coopPinDigits);
  // Equal PINs would let a player type their own and pass.
  while (partner === owner) partner = rollPin(rng, params.coopPinDigits);
  return { owner, partner };
}

/** The puzzle for one slot: only the PIN that slot has to show. */
export function puzzleFor(pins: CoopPins, slot: CoopSlot): CoopPuzzle {
  return { show: pins[slot], digits: pins[slot].length };
}

/** `answer` is right when it equals the PIN the *other* slot shows. */
export function verifyCoopPin(pins: CoopPins, slot: CoopSlot, answer: CoopPinAnswer): boolean {
  return answer.pin === pins[slot === 'owner' ? 'partner' : 'owner'];
}

export const coopPinAnswerSchema = (params: CoopPinParams) =>
  z.strictObject({ pin: z.string().regex(new RegExp(`^\\d{${params.coopPinDigits}}$`)) });
