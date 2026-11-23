/** Core domain vocabulary shared by the server engine and the client. */

/**
 * Room phase. Phase 1 has the lobby and a placeholder `starting` phase that
 * the countdown ends in; Phase 4 replaces `starting` with spawn → reveal → play.
 */
export const PHASES = ['lobby', 'starting'] as const;
export type Phase = (typeof PHASES)[number];

/** `spectator` arrives with ejection (Phase 8). */
export type PlayerStatus = 'active' | 'spectator';

/** Why the server closed a socket's session (`kicked` event). */
export type KickReason = 'replaced' | 'kicked';
