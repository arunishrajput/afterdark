/** Core domain vocabulary shared by the server engine and the client. */

/**
 * Room phase. The lobby's start countdown runs inside `lobby`; when it ends the
 * room goes `spawning → reveal → playing → ended` (RULES §4–§5, §12). A host
 * abort or a win moves it to `ended`.
 */
export const PHASES = ['lobby', 'spawning', 'reveal', 'playing', 'ended'] as const;
export type Phase = (typeof PHASES)[number];

/** The phases after the lobby: a game is running or has just ended. */
export const GAME_PHASES = ['spawning', 'reveal', 'playing', 'ended'] as const;

/** `spectator` arrives with ejection (Phase 8). */
export type PlayerStatus = 'active' | 'spectator';

/** Why the server closed a socket's session (`kicked` event). */
export type KickReason = 'replaced' | 'kicked';

/** Secret role (ROLES.md). Only the owner and, for imposters, their allies ever see it. */
export type Role = 'crew' | 'imposter';

/** An imposter's secret special ability (ROLES.md › Imposter classes). */
export const IMPOSTER_CLASSES = ['saboteur', 'phantom', 'camouflage'] as const;
export type ImposterClass = (typeof IMPOSTER_CLASSES)[number];

/** Who won (RULES §12). `null` is no result (V6, a host abort). */
export type Winner = 'crew' | 'imposters' | 'draw' | null;

/** Which victory rule ended the game (RULES §12: V4 time, V5 forfeit, V6 abort; V1–V3 arrive later). */
export type EndReason = 'score' | 'ejection' | 'infection' | 'time' | 'forfeit' | 'abort';
