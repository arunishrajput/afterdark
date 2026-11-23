import { hashSeed } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { reduce } from '../reduce';
import type { RoomState } from '../state';
import { advanceTo, errCode, newLobby, readyAll, run, S, toPlaying, toSpawning } from '../testkit';

const again = (s: RoomState, now: number, salt = 'fresh-salt', playerId = 'host') =>
  reduce(s, { type: 'playAgain', playerId, salt }, now);

/** A finished 6-player game: a meeting-less abort 30 s into play, with some per-game state to clear. */
function ended(players = 6) {
  const { state, now } = toPlaying(newLobby({ players }));
  const s = structuredClone(state);
  s.players[2]!.spectator = true;
  s.players[2]!.revealedRole = 'crew';
  s.players[2]!.wronglyEjected = true;
  s.players[3]!.infection = 'infected';
  s.players[3]!.walkedM = 120;
  s.players[3]!.meetingsCalled = 1;
  const done = run(s, { type: 'abort', playerId: 'host' }, now + 30 * S);
  return { state: done.state, now: now + 30 * S };
}

describe('play again (RULES §12, Phase 12)', () => {
  it('is for the host, once the game has ended', () => {
    const f = ended();
    expect(errCode(again(f.state, f.now, 'x', 'p1'))).toBe('NOT_HOST');
    const playing = toPlaying(newLobby({ players: 5 }));
    expect(errCode(again(playing.state, playing.now))).toBe('WRONG_PHASE');
    expect(errCode(again(newLobby({ players: 4 }), 0))).toBe('WRONG_PHASE');
  });

  it('returns to the lobby with the same map, setup and config, and nobody ready', () => {
    const f = ended();
    const res = run(f.state, { type: 'playAgain', playerId: 'host', salt: 's1' }, f.now);
    const s = res.state;
    expect(s.phase).toBe('lobby');
    expect(s.game).toBeUndefined();
    expect(s.result).toBeUndefined();
    expect(s.countdownEndsAt).toBeUndefined();
    expect(s.spawnEndsAt).toBeUndefined();
    expect(s.boundary).toEqual(f.state.boundary);
    expect(s.setup).toEqual(f.state.setup);
    expect(s.config).toEqual(f.state.config);
    expect(s.hostId).toBe('host');
    expect(s.players.map((p) => p.id)).toEqual(f.state.players.map((p) => p.id));
    expect(s.players.every((p) => !p.ready)).toBe(true);
  });

  it('clears every per-game field and puts ejected players back to active', () => {
    const f = ended();
    const s = run(f.state, { type: 'playAgain', playerId: 'host', salt: 's1' }, f.now).state;
    for (const p of s.players) {
      for (const key of [
        'role',
        'tag',
        'classes',
        'personalScore',
        'tasks',
        'partnerTask',
        'infection',
        'exposure',
        'infect',
        'abilities',
        'zone',
        'spectator',
        'revealedRole',
        'wronglyEjected',
        'meetingsCalled',
        'walkedM',
        'walkFrom',
        'spawn',
        'rerollReadyAtGameMs',
      ]) {
        expect(p, `${p.id}.${key}`).not.toHaveProperty(key);
      }
      expect(p.connected).toBe(true);
      expect(p.loc).toBeDefined();
    }
  });

  it('keeps bots, and drops players who left or have been gone longer than rematchDropAfterS', () => {
    const f = ended(7);
    const s0 = structuredClone(f.state);
    const dropMs = s0.config.rematchDropAfterS * S;
    s0.players[1]!.left = true;
    s0.players[1]!.connected = false;
    s0.players[1]!.disconnectedAt = f.now - 10 * S;
    s0.players[2]!.connected = false;
    s0.players[2]!.disconnectedAt = f.now - dropMs - S; // gone too long
    s0.players[3]!.connected = false;
    s0.players[3]!.disconnectedAt = f.now - dropMs + 20 * S; // still within the allowance
    s0.players[4]!.bot = true;
    const res = run(s0, { type: 'playAgain', playerId: 'host', salt: 's2' }, f.now);
    const ids = res.state.players.map((p) => p.id);
    expect(ids).not.toContain(s0.players[1]!.id);
    expect(ids).not.toContain(s0.players[2]!.id);
    expect(ids).toContain(s0.players[3]!.id);
    expect(res.state.players.find((p) => p.id === s0.players[4]!.id)?.bot).toBe(true);
    // The one still disconnected is told to go; the one who already left was dealt with when they left.
    const removed = res.effects.filter((e) => e.kind === 'removed').map((e) => e.playerId);
    expect(removed).toEqual([s0.players[2]!.id]);
    // A kept, disconnected player stays disconnected and un-readied.
    expect(res.state.players.find((p) => p.id === s0.players[3]!.id)?.connected).toBe(false);
  });

  it('draws a fresh secret seed, so roles and spawns differ from the last game', () => {
    const f = ended();
    const s = run(f.state, { type: 'playAgain', playerId: 'host', salt: 'new' }, f.now).state;
    expect(s.radarSalt).toBe('new');
    expect(s.secretSeed).toBe(hashSeed('game|new'));
    expect(s.secretSeed).not.toBe(f.state.secretSeed);
  });

  it('works after an abort while the host had paused the game', () => {
    const { state, now } = toPlaying(newLobby({ players: 5 }));
    const paused = run(state, { type: 'pause', playerId: 'host' }, now + S).state;
    const done = run(paused, { type: 'abort', playerId: 'host' }, now + 2 * S).state;
    expect(errCode(again(done, now + 3 * S))).toBe('OK');
  });

  it('a second game can be played from the rematch lobby', () => {
    const f = ended(6);
    const lobby = run(
      f.state,
      { type: 'playAgain', playerId: 'host', salt: 'round2' },
      f.now,
    ).state;
    const t = f.now + S;
    const ready = readyAll(advanceTo(lobby, t), t);
    expect(ready.countdownEndsAt).toBeDefined();
    const spawning = toSpawning(lobby);
    expect(spawning.state.phase).toBe('spawning');
    const second = toPlaying(lobby);
    expect(second.state.game?.teamScore).toBe(0);
    expect(second.state.game?.log).toHaveLength(1);
    expect(second.state.players.filter((p) => p.role === 'imposter')).toHaveLength(2);
  });
});
