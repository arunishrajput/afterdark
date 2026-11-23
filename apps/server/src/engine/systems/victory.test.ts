import { DEFAULT_CONFIG } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { reduce } from '../reduce';
import { advanceTo, newLobby, run, S, toPlaying, toReveal } from '../testkit';
import { tick } from '../tick';
import type { Effect } from '../types';
import { compromisedCount } from './victory';

const MATCH_MS = DEFAULT_CONFIG.playTimeMin * 60 * S;
const FORFEIT_MS = DEFAULT_CONFIG.forfeitAfterS * S;

const ended = (effects: Effect[]) =>
  effects.filter((e) => e.kind === 'event' && e.event.type === 'game.ended');

describe('V4: time-up (RULES §12)', () => {
  it('does not end before the clock reaches playTimeMin', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    expect(advanceTo(state, now + MATCH_MS - S).phase).toBe('playing');
  });

  it('crew win on time when their progress is higher', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    const s = structuredClone(state);
    if (s.game) s.game.teamScore = 40; // 0.40 vs 0 compromised
    const res = tick(s, now + MATCH_MS);
    expect(res.state.phase).toBe('ended');
    expect(res.state.result).toEqual({ winner: 'crew', reason: 'time' });
    expect(ended(res.effects)).toHaveLength(1);
  });

  it('imposters win on time when compromised progress is higher', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    const s = structuredClone(state);
    const victim = s.players.find((p) => p.role === 'crew');
    if (victim) victim.infection = 'infected';
    expect(compromisedCount(s)).toBe(1); // 1 of the threshold 3
    const res = tick(s, now + MATCH_MS);
    expect(res.state.result).toEqual({ winner: 'imposters', reason: 'time' });
  });

  it('is a draw when both progress ratios are exactly equal (E30), including 0 vs 0', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    const res = tick(state, now + MATCH_MS);
    expect(res.state.result).toEqual({ winner: 'draw', reason: 'time' });
  });

  it('uses game time: a host pause delays the end', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    let s = run(state, { type: 'pause', playerId: 'host' }, now + 100 * S).state;
    s = run(s, { type: 'resume', playerId: 'host' }, now + 400 * S).state;
    expect(tick(s, now + MATCH_MS).state.phase).toBe('playing'); // 300 s still owed
    expect(tick(s, now + MATCH_MS + 300 * S).state.phase).toBe('ended');
  });
});

describe('V5: forfeit (RULES §10.6)', () => {
  const dropAll = (state: ReturnType<typeof newLobby>, role: 'crew' | 'imposter', at: number) => {
    let s = state;
    for (const p of state.players.filter((x) => x.role === role)) {
      s = run(s, { type: 'disconnect', playerId: p.id }, at).state;
    }
    return s;
  };

  it('crew win when every imposter has been gone for forfeitAfterS', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    const s = dropAll(state, 'imposter', now + 10 * S);
    expect(tick(s, now + 10 * S + FORFEIT_MS - S).state.phase).toBe('playing');
    const res = tick(s, now + 10 * S + FORFEIT_MS);
    expect(res.state.result).toEqual({ winner: 'crew', reason: 'forfeit' });
  });

  it('imposters win when every crew member has been gone that long', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    const s = dropAll(state, 'crew', now + 10 * S);
    expect(tick(s, now + 10 * S + FORFEIT_MS).state.result).toEqual({
      winner: 'imposters',
      reason: 'forfeit',
    });
  });

  it('one imposter still connected is enough: no forfeit', () => {
    const { state, now } = toPlaying(newLobby({ players: 10 })); // 3 imposters
    const imposters = state.players.filter((p) => p.role === 'imposter');
    let s = state;
    for (const p of imposters.slice(1))
      s = run(s, { type: 'disconnect', playerId: p.id }, now).state;
    expect(tick(s, now + FORFEIT_MS * 2).state.phase).toBe('playing');
  });

  it('a player who reconnects in time resets the clock', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    let s = dropAll(state, 'imposter', now + 10 * S);
    for (const p of s.players.filter((x) => x.role === 'imposter')) {
      s = run(s, { type: 'connect', playerId: p.id }, now + 100 * S).state;
    }
    expect(tick(s, now + 10 * S + FORFEIT_MS * 2).state.phase).toBe('playing');
  });

  it('players who left count as gone', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    let s = state;
    for (const p of state.players.filter((x) => x.role === 'imposter')) {
      s = run(s, { type: 'leave', playerId: p.id }, now + 5 * S).state;
    }
    expect(tick(s, now + 5 * S + FORFEIT_MS).state.result?.winner).toBe('crew');
  });

  it('time spent disconnected before the roles were assigned does not count', () => {
    const reveal = toReveal(newLobby({ players: 6 }));
    // Everyone's `disconnectedAt` is older than the forfeit window, but roles were just assigned.
    const s = structuredClone(reveal.state);
    for (const p of s.players.filter((x) => x.role === 'imposter')) {
      p.connected = false;
      p.disconnectedAt = reveal.now - FORFEIT_MS * 3;
    }
    expect(tick(s, reveal.now + S).state.phase).toBe('reveal');
  });

  it('both sides gone at once is a draw', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    let s = dropAll(state, 'imposter', now + 5 * S);
    s = dropAll(s, 'crew', now + 5 * S);
    expect(tick(s, now + 5 * S + FORFEIT_MS).state.result).toEqual({
      winner: 'draw',
      reason: 'forfeit',
    });
  });

  it('reduce also checks victory (a command after the window ends the game)', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    const s = dropAll(state, 'imposter', now + 5 * S);
    const crew = s.players.find((p) => p.role === 'crew');
    const res = reduce(
      s,
      {
        type: 'locUpdate',
        playerId: crew?.id ?? '',
        fix: { lat: 28.6139, lng: 77.209, accuracy: 5, ts: now + 5 * S + FORFEIT_MS },
      },
      now + 5 * S + FORFEIT_MS,
    );
    expect(res.ok && res.state.phase).toBe('ended');
  });
});

describe('V1 team score (RULES §12)', () => {
  it('ends the game as a crew win the moment the team score reaches the target', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    const s = structuredClone(state);
    if (s.game) s.game.teamScore = s.config.targetScore;
    const next = tick(s, now + 10 * S).state;
    expect(next.phase).toBe('ended');
    expect(next.result).toEqual({ winner: 'crew', reason: 'score' });
  });

  it('a score just under the target does not', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    const s = structuredClone(state);
    if (s.game) s.game.teamScore = s.config.targetScore - 1;
    expect(tick(s, now + 10 * S).state.phase).toBe('playing');
  });

  it('beats time-up when both happen on the same tick (strict order V1 before V4)', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    const s = structuredClone(state);
    if (s.game) s.game.teamScore = s.config.targetScore;
    const end = now + s.config.playTimeMin * 60 * S;
    const next = advanceTo(s, end);
    expect(next.result).toEqual({ winner: 'crew', reason: 'score' });
  });
});
