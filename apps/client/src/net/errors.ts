/** Friendly copy for server error codes shown in forms and toasts. */
import type { ErrorCode } from '@afterdark/shared';

export type ClientErrorCode = ErrorCode | 'TIMEOUT';

const MESSAGES: Partial<Record<ClientErrorCode, string>> = {
  INVALID_PAYLOAD: 'Check what you typed and try again.',
  NOT_FOUND: 'No lobby with that code.',
  LOBBY_FULL: 'That lobby is full.',
  GAME_IN_PROGRESS: 'That game has already started.',
  NAME_TAKEN: 'Someone in the lobby already has that name.',
  NOT_HOST: 'Only the host can do that.',
  NOT_ALLOWED: 'That isn’t allowed right now.',
  WRONG_PHASE: 'That isn’t possible right now.',
  WEAK_GPS: 'GPS is too weak. Move into the open and wait for a better fix.',
  STALE: 'Your location is out of date. Check your GPS and try again.',
  OUT_OF_RANGE: 'Walk closer to the pin.',
  TASKS_LOCKED: 'Tasks are locked: you are out of the zone, or systems are jammed.',
  COOLDOWN: 'Not ready yet. Wait a moment.',
  PAUSED: 'The game is paused.',
  MEETING_ACTIVE: 'A meeting is in progress.',
  RATE_LIMITED: 'Slow down a little and try again.',
  SERVER_BUSY: 'The server is full right now. Try again in a few minutes.',
  KICKED: 'You were removed from that lobby.',
  TIMEOUT: 'No answer from the server. Check your connection.',
};

export function messageFor(code: ClientErrorCode): string {
  return MESSAGES[code] ?? 'Something went wrong. Try again.';
}
