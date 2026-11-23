import { DEFAULT_CONFIG, IMPOSTER_CLASSES, TAG_PATTERN } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { newLobby, toReveal } from '../testkit';
import { imposterCountFor } from './roles';

const reveal = (players: number, radarSalt = 'salt', config = {}) =>
  toReveal(newLobby({ players, radarSalt, config })).state;

describe('imposter count (RULES §5.1)', () => {
  it.each([
    [4, 1],
    [5, 1],
    [6, 2],
    [8, 2],
    [9, 2],
    [10, 3],
    [12, 3],
  ])('%i players get %i imposter(s) by the auto table', (players, expected) => {
    const s = reveal(players);
    expect(s.players.filter((p) => p.role === 'imposter')).toHaveLength(expected);
    expect(s.players.filter((p) => p.role === 'crew')).toHaveLength(players - expected);
  });

  it('never leaves fewer than minCrewRemaining crew', () => {
    const lobby = newLobby({ players: 4 });
    expect(imposterCountFor({ ...lobby, config: { ...lobby.config, imposterCount: 3 } }, 4)).toBe(1);
    expect(imposterCountFor({ ...lobby, config: { ...lobby.config, imposterCount: 2 } }, 6)).toBe(2);
    expect(imposterCountFor({ ...lobby, config: { ...lobby.config, imposterCount: 3 } }, 5)).toBe(2);
  });

  it('honours a manual count', () => {
    const s = reveal(9, 'salt', { imposterCount: 1 });
    expect(s.players.filter((p) => p.role === 'imposter')).toHaveLength(1);
  });
});

describe('tags (RULES §5.2)', () => {
  it('gives every player a unique-word WORD-NN tag', () => {
    const s = reveal(12);
    const tags = s.players.map((p) => p.tag ?? '');
    for (const t of tags) expect(t).toMatch(TAG_PATTERN);
    expect(new Set(tags.map((t) => t.split('-')[0])).size).toBe(12);
    expect(new Set(tags).size).toBe(12);
  });
});

describe('classes (RULES §5.3)', () => {
  it('classes mode: each imposter has exactly one class, no repeats', () => {
    for (let n = 0; n < 12; n++) {
      const s = reveal(12, `salt${n}`);
      const imposters = s.players.filter((p) => p.role === 'imposter');
      expect(imposters).toHaveLength(3);
      for (const p of imposters) expect(p.classes).toHaveLength(1);
      expect(new Set(imposters.flatMap((p) => p.classes ?? [])).size).toBe(3);
    }
  });

  it('with 2 imposters exactly 2 of the 3 classes are in play', () => {
    const s = reveal(8);
    const classes = s.players.flatMap((p) => p.classes ?? []);
    expect(classes).toHaveLength(2);
    expect(new Set(classes).size).toBe(2);
    for (const c of classes) expect(IMPOSTER_CLASSES).toContain(c);
  });

  it('all mode: every imposter has all three classes', () => {
    const s = reveal(8, 'salt', { imposterAbilityMode: 'all' });
    for (const p of s.players.filter((x) => x.role === 'imposter')) {
      expect([...(p.classes ?? [])].sort()).toEqual([...IMPOSTER_CLASSES].sort());
    }
  });

  it('crew have no classes', () => {
    const s = reveal(8);
    for (const p of s.players.filter((x) => x.role === 'crew')) expect(p.classes).toBeUndefined();
  });
});

describe('game state fixed at the reveal (RULES §12)', () => {
  it('fixes originalCrewCount and the infection threshold', () => {
    const s = reveal(8);
    expect(s.game?.originalCrewCount).toBe(6);
    expect(s.game?.threshold).toBe(4);
    expect(s.game?.teamScore).toBe(0);
    expect(s.game?.matchEndsAtGameMs).toBe(DEFAULT_CONFIG.playTimeMin * 60_000);
  });

  it('starts every personal score at 0', () => {
    for (const p of reveal(8).players) expect(p.personalScore).toBe(0);
  });
});

describe('determinism (RULES §1.3)', () => {
  const summary = (salt: string) =>
    reveal(8, salt).players.map((p) => `${p.id}:${p.role}:${p.tag}:${(p.classes ?? []).join('+')}`);

  it('the same secret seed gives the same roles, tags and classes', () => {
    expect(summary('same')).toEqual(summary('same'));
  });

  it('a different seed gives a different assignment', () => {
    expect(summary('one')).not.toEqual(summary('two'));
  });

  it('over many seeds every seat is an imposter some of the time (a fair shuffle)', () => {
    const counts = new Map<string, number>();
    for (let n = 0; n < 60; n++) {
      for (const p of reveal(6, `fair${n}`).players) {
        if (p.role === 'imposter') counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(6);
    for (const c of counts.values()) expect(c).toBeGreaterThan(5);
  });

  it('does not depend on the public lobby code', () => {
    // Same salt, different code: roles come from the room's secret seed only.
    const a = toReveal(newLobby({ players: 8, radarSalt: 'x' })).state;
    const b = toReveal(newLobby({ players: 8, radarSalt: 'x' })).state;
    b.code = 'ZZZZZZ';
    expect(a.players.map((p) => p.role)).toEqual(b.players.map((p) => p.role));
  });
});
