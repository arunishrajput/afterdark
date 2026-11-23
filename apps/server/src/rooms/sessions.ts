/**
 * Session tokens (ARCHITECTURE §6). A token is a 128-bit+ random secret that
 * maps to `{code, playerId}`; it lives only here and in the player's
 * localStorage, never in engine state or views. Each player has at most one
 * bound socket: the newest wins.
 */
import { randomId } from '@afterdark/shared';

/** 22 symbols × 6 bits = 132 bits of entropy. */
const TOKEN_LENGTH = 22;

interface Session {
  token: string;
  code: string;
  playerId: string;
  socketId?: string;
}

export type ResolveResult =
  { status: 'ok'; code: string; playerId: string } | { status: 'kicked' } | { status: 'unknown' };

export class SessionRegistry {
  private readonly byToken = new Map<string, Session>();
  private readonly byPlayer = new Map<string, Session>();
  /** Kicked tokens → lobby code (RULES §3.8: a kicked session can't rejoin). */
  private readonly banned = new Map<string, string>();

  issue(code: string, playerId: string): string {
    const token = randomId(TOKEN_LENGTH);
    const session: Session = { token, code, playerId };
    this.byToken.set(token, session);
    this.byPlayer.set(playerId, session);
    return token;
  }

  resolve(token: string): ResolveResult {
    if (this.banned.has(token)) return { status: 'kicked' };
    const s = this.byToken.get(token);
    return s ? { status: 'ok', code: s.code, playerId: s.playerId } : { status: 'unknown' };
  }

  /** Binds `socketId` to the player; returns the previously bound socket, if any. */
  bind(playerId: string, socketId: string): string | undefined {
    const s = this.byPlayer.get(playerId);
    if (!s) return undefined;
    const previous = s.socketId;
    s.socketId = socketId;
    return previous === socketId ? undefined : previous;
  }

  /** Unbinds only if `socketId` is still the bound one. Returns whether it was. */
  unbind(playerId: string, socketId: string): boolean {
    const s = this.byPlayer.get(playerId);
    if (s?.socketId !== socketId) return false;
    delete s.socketId;
    return true;
  }

  socketOf(playerId: string): string | undefined {
    return this.byPlayer.get(playerId)?.socketId;
  }

  revoke(playerId: string, reason: 'left' | 'kicked'): void {
    const s = this.byPlayer.get(playerId);
    if (!s) return;
    this.byPlayer.delete(playerId);
    this.byToken.delete(s.token);
    if (reason === 'kicked') this.banned.set(s.token, s.code);
  }

  purgeLobby(code: string): void {
    for (const s of [...this.byToken.values()]) {
      if (s.code === code) {
        this.byToken.delete(s.token);
        this.byPlayer.delete(s.playerId);
      }
    }
    for (const [token, c] of [...this.banned]) if (c === code) this.banned.delete(token);
  }
}
