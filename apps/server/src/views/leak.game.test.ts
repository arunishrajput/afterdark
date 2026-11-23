/**
 * Leak tests for the game phases (TESTING.md §3, Phase 4): roles, tags, classes,
 * spawns, the host, infection-shape parity and the radar flags.
 */
import { describe, expect, it } from 'vitest';

import {
  ALLOWED_VIEW_KEYS,
  buildGameFixture,
  type GamePhaseFixture,
  keysDeep,
} from './leakHarness';
import { projectView } from './projectView';
import { buildRadar } from './radar';

const PHASES: GamePhaseFixture[] = ['spawning', 'reveal', 'playing', 'ended'];

/** Key names a crew view must never contain, at any depth. */
const CREW_FORBIDDEN = [
  'imposter',
  'classes',
  'allies',
  'infected',
  'exposed',
  'compromisedIds',
  'incubation',
  'token',
  'disconnectedAt',
  'left',
  'infection',
];

const lastName = (path: string) => path.split('.').pop()?.replace('[]', '') ?? '';
const namesOf = (view: unknown) => new Set(keysDeep(view).map(lastName));
const exactNumber = (n: number) =>
  new RegExp(`(^|[^\\d.])${String(n).replace('.', '\\.')}($|[^\\d])`);

describe.each(PHASES)('leak: game fixture in the %s phase', (phase) => {
  const { state, now, tokens } = buildGameFixture({ players: 8, phase });
  const views = state.players.map((p) => ({
    player: p,
    view: projectView(state, p.id, now),
  }));
  const crew = views.filter((v) => v.player.role !== 'imposter');
  const imposters = views.filter((v) => v.player.role === 'imposter');

  it('has the roles the phase needs', () => {
    if (phase === 'spawning') expect(state.players.every((p) => p.role === undefined)).toBe(true);
    else {
      expect(imposters).toHaveLength(2);
      expect(crew).toHaveLength(6);
    }
  });

  it('every view contains only allow-listed key paths', () => {
    for (const { view } of views) {
      const keys = keysDeep(view).filter((k) => !k.startsWith('lobby.config.'));
      for (const k of keys) expect(ALLOWED_VIEW_KEYS, `unexpected key ${k}`).toContain(k);
    }
  });

  it('no view contains anyone’s session token', () => {
    for (const { view } of views) {
      const json = JSON.stringify(view);
      for (const token of tokens.values()) expect(json).not.toContain(token);
    }
  });

  it('before the reveal nobody has a tag, role or imposter block', () => {
    if (phase !== 'spawning') return;
    for (const { view } of views) {
      expect(view.me.tag).toBeUndefined();
      expect(view.me.role).toBeUndefined();
      expect(view.me.imposter).toBeUndefined();
    }
  });

  it('a view has the viewer’s own spawn and never another player’s', () => {
    for (const { player, view } of views) {
      expect(view.me.spawn).toMatchObject({ lat: player.spawn?.lat, lng: player.spawn?.lng });
      const json = JSON.stringify(view);
      for (const other of state.players) {
        if (other.id === player.id || !other.spawn) continue;
        expect(json, `${player.id} sees ${other.id}'s spawn lat`).not.toMatch(
          exactNumber(other.spawn.lat),
        );
        expect(json, `${player.id} sees ${other.id}'s spawn lng`).not.toMatch(
          exactNumber(other.spawn.lng),
        );
      }
    }
  });

  it('a crew view has no imposter key, no class and no other player’s tag or role', () => {
    if (phase === 'spawning') return;
    for (const { player, view } of crew) {
      const names = namesOf(view);
      for (const bad of CREW_FORBIDDEN) expect(names.has(bad), `${player.id}: ${bad}`).toBe(false);
      expect(view.me.role).toBe('crew');
      expect(view.me.tag).toBe(player.tag);
      const json = JSON.stringify(view);
      for (const other of state.players) {
        if (other.id === player.id) continue;
        expect(json, `${player.id} sees ${other.id}'s tag`).not.toContain(other.tag ?? '#none#');
      }
      // No view of a crew member states anyone else's role anywhere.
      expect(JSON.stringify(view.lobby.players)).not.toMatch(/imposter|crew|role/i);
    }
  });

  it('an imposter sees exactly the other imposters (username, tag, class), never a crew member’s tag', () => {
    if (phase === 'spawning') return;
    for (const { player, view } of imposters) {
      expect(view.me.role).toBe('imposter');
      expect(view.me.imposter?.classes).toEqual(player.classes);
      const allies = view.me.imposter?.allies ?? [];
      const others = imposters.filter((i) => i.player.id !== player.id);
      expect(allies.map((a) => a.playerId).sort()).toEqual(others.map((o) => o.player.id).sort());
      for (const a of allies) {
        const real = state.players.find((p) => p.id === a.playerId);
        expect(a).toEqual({
          playerId: real?.id,
          username: real?.username,
          tag: real?.tag,
          classes: real?.classes,
        });
      }
      const json = JSON.stringify(view);
      for (const c of crew)
        expect(json, `imposter sees crew tag ${c.player.id}`).not.toContain(
          c.player.tag ?? '#none#',
        );
    }
  });

  it('the host’s view has the same structure as another player’s of the same role', () => {
    if (phase === 'spawning') return;
    const host = views.find((v) => v.player.id === state.hostId);
    const sameRole = views.filter(
      (v) => v.player.role === host?.player.role && v.player.id !== state.hostId,
    );
    expect(sameRole.length).toBeGreaterThan(0);
    // Imposter allies differ in count, so compare the key sets, not the values.
    const hostKeys = keysDeep(host?.view);
    for (const { view } of sameRole) expect(keysDeep(view)).toEqual(hostKeys);
  });

  it('the public game numbers are identical for every viewer', () => {
    const strip = (v: (typeof views)[number]['view']) => {
      const { regionCounts: _regionCounts, ...rest } = v.game ?? { regionCounts: [] };
      return JSON.stringify(rest);
    };
    const first = strip(views[0]?.view as (typeof views)[number]['view']);
    for (const { view } of views) expect(strip(view)).toBe(first);
  });

  it('radar frames never carry an ally flag for crew and never an id, tag or name', () => {
    const s = structuredClone(state);
    s.config.playerVisibility = 'all';
    for (const { player } of views) {
      const dots = buildRadar(s, player.id, now);
      const frame = JSON.stringify(dots);
      for (const p of s.players) {
        expect(frame).not.toContain(`"${p.id}"`);
        expect(frame).not.toContain(p.username);
        if (p.tag) expect(frame).not.toContain(p.tag);
      }
      if (player.role !== 'imposter') {
        for (const d of dots) expect(d.flags).not.toContain('ally');
      }
    }
  });
});

describe('leak: an infected crew member looks exactly like a healthy one (Phase 7 will rely on it)', () => {
  const healthy = buildGameFixture({ players: 8, phase: 'playing' });
  const crewId = healthy.state.players.find((p) => p.role === 'crew')?.id ?? '';
  const infectedFixture = buildGameFixture({
    players: 8,
    phase: 'playing',
    infection: { id: crewId, status: 'infected' },
  });
  const exposedFixture = buildGameFixture({
    players: 8,
    phase: 'playing',
    infection: { id: crewId, status: 'exposed' },
  });

  it('the fixtures differ only in that one status', () => {
    expect(infectedFixture.state.players.map((p) => p.role)).toEqual(
      healthy.state.players.map((p) => p.role),
    );
    expect(infectedFixture.state.players.find((p) => p.id === crewId)?.infection).toBe('infected');
    expect(healthy.state.players.find((p) => p.id === crewId)?.infection).toBeUndefined();
  });

  it('the infected player’s own view equals the healthy one, apart from the public compromised count', () => {
    const a = projectView(healthy.state, crewId, healthy.now);
    const b = projectView(infectedFixture.state, crewId, infectedFixture.now);
    const c = projectView(exposedFixture.state, crewId, exposedFixture.now);
    // Exposed is invisible to everyone, so that view is byte-for-byte the healthy one.
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
    // Infected also raises the public infection boxes for everybody, themselves included; nothing else moves.
    if (b.game) b.game.compromised = a.game?.compromised ?? 0;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('every other crew view has the same keys whatever the status', () => {
    for (const p of healthy.state.players.filter((x) => x.role === 'crew')) {
      const base = keysDeep(projectView(healthy.state, p.id, healthy.now));
      expect(keysDeep(projectView(infectedFixture.state, p.id, infectedFixture.now))).toEqual(base);
      expect(keysDeep(projectView(exposedFixture.state, p.id, exposedFixture.now))).toEqual(base);
    }
  });

  it('only the public compromised count moves, and only for a completed infection', () => {
    const viewOf = (f: typeof healthy, id: string) => projectView(f.state, id, f.now).game;
    const other = healthy.state.players.find((p) => p.role === 'crew' && p.id !== crewId)?.id ?? '';
    expect(viewOf(healthy, other)?.compromised).toBe(0);
    expect(viewOf(infectedFixture, other)?.compromised).toBe(1);
    expect(viewOf(exposedFixture, other)?.compromised).toBe(0); // exposed is not yet compromised
  });

  it('no view contains the words infected, exposed or incubation as a key', () => {
    for (const f of [infectedFixture, exposedFixture]) {
      for (const p of f.state.players) {
        const names = namesOf(projectView(f.state, p.id, f.now));
        for (const bad of ['infected', 'exposed', 'incubation', 'compromisedIds', 'infection']) {
          expect(names.has(bad), `${p.id}: ${bad}`).toBe(false);
        }
      }
    }
  });
});

describe('leak: radar ally flags', () => {
  const { state, now } = buildGameFixture({ players: 8, phase: 'playing' });
  const s = structuredClone(state);
  s.config.playerVisibility = 'all';

  it('an imposter’s radar marks exactly the other imposters as allies', () => {
    for (const me of s.players.filter((p) => p.role === 'imposter')) {
      const dots = buildRadar(s, me.id, now);
      const allyDots = dots.filter((d) => d.flags.includes('ally'));
      const allies = s.players.filter((p) => p.role === 'imposter' && p.id !== me.id);
      expect(allyDots).toHaveLength(allies.length);
      for (const a of allies) {
        expect(allyDots.some((d) => d.lat === a.loc?.lat && d.lng === a.loc?.lng)).toBe(true);
      }
    }
  });

  it('crew radar dots only ever carry the public flags', () => {
    for (const me of s.players.filter((p) => p.role === 'crew')) {
      for (const d of buildRadar(s, me.id, now)) {
        for (const f of d.flags) expect(['oob', 'stale']).toContain(f);
      }
    }
  });
});

describe('leak: the zone view has the same shape for every role', () => {
  it('crew and imposter me.zone have the same keys, in and out of bounds', () => {
    const { state, now } = buildGameFixture({ players: 8, phase: 'playing' });
    const s = structuredClone(state);
    for (const p of s.players)
      if (p.id === 'p1' || p.id === 'p2') p.zone = { outSince: 0, penalties: 0 };
    for (const p of s.players) {
      const zone = projectView(s, p.id, now).me.zone;
      expect(zone).toBeDefined();
      const keys = Object.keys(zone ?? {}).sort();
      expect(['oob'].every((k) => keys.includes(k))).toBe(true);
      expect(keys.every((k) => ['oob', 'graceEndsAt'].includes(k))).toBe(true);
    }
  });
});
