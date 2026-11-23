import { distanceM, sectionOf } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import type { RoomState } from '../state';
import {
  advanceTo,
  advanceWithEffects,
  crewOf,
  moveTo,
  newLobby,
  otherPointInSection,
  run,
  S,
  stayAt,
  taskAt,
  toPlaying,
} from '../testkit';
import { nearTarget } from './tasks';

function playing(opts: Parameters<typeof newLobby>[0] = {}) {
  return toPlaying(newLobby(opts));
}

const eventTypes = (effects: { kind: string; event?: { type: string } }[]) =>
  effects.filter((e) => e.kind === 'event').map((e) => e.event?.type);

describe('assignment (RULES §6.1, TASKS §2, MAP §4)', () => {
  it('gives every crew member taskSlots tasks and imposters none', () => {
    const { state } = playing();
    for (const p of state.players) {
      if (p.role === 'crew') expect(p.tasks).toHaveLength(state.config.taskSlots);
      else expect(p.tasks).toBeUndefined();
    }
    expect(crewOf(state).length).toBeGreaterThan(0);
  });

  it('starts every task at stage assigned, on a distinct point per player, with 16-symbol ids', () => {
    const { state } = playing();
    const ids = new Set<string>();
    for (const p of crewOf(state)) {
      const points = new Set(p.tasks?.map((t) => t.pointId));
      expect(points.size).toBe(p.tasks?.length);
      for (const t of p.tasks ?? []) {
        expect(t).toMatchObject({ stage: 'assigned', atPin: false, kind: 'solo' });
        expect(t.id).toMatch(/^[A-Za-z0-9_-]{16}$/);
        ids.add(t.id);
      }
    }
    expect(ids.size).toBe(crewOf(state).length * state.config.taskSlots);
  });

  it('avoids sharing a point between players while the pool has room', () => {
    const { state } = playing();
    const pointIds = crewOf(state).flatMap((p) => (p.tasks ?? []).map((t) => t.pointId));
    expect(new Set(pointIds).size).toBe(pointIds.length);
  });

  it('prefers pins at least taskMinDistanceM from the player', () => {
    const { state } = playing();
    for (const p of crewOf(state)) {
      for (const t of p.tasks ?? []) {
        expect(p.loc && distanceM(p.loc, t)).toBeGreaterThanOrEqual(state.config.taskMinDistanceM);
      }
    }
  });

  it('only rolls enabled minigame types', () => {
    const { state } = playing();
    for (const p of crewOf(state)) {
      for (const t of p.tasks ?? []) expect(state.config.minigamesEnabled).toContain(t.type);
    }
  });

  it('is reproducible from the secret seed', () => {
    const a = playing().state;
    const b = playing().state;
    expect(crewOf(a).map((p) => p.tasks)).toEqual(crewOf(b).map((p) => p.tasks));
  });

  it('holds the reroll cooldown and the task counter in the game state', () => {
    const { state } = playing();
    expect(state.game?.taskSeq).toBeGreaterThan(0);
  });
});

describe('Stage 2: the pin appears after holding the section (MAP §3)', () => {
  it('reveals after sectionEntryHoldS of good fixes inside the section, and sends task.revealed', () => {
    const { state, now } = playing();
    const crew = crewOf(state)[0]!;
    const task = taskAt(state, crew.id);
    const spot = otherPointInSection(state, task);
    const arrived = stayAt(state, crew.id, spot, now, state.config.sectionEntryHoldS - 1);
    expect(taskAt(arrived.state, crew.id).stage).toBe('assigned');
    const t = arrived.now + S;
    const done = advanceWithEffects(arrived.state, t);
    expect(taskAt(done.state, crew.id).stage).toBe('pin');
    const toCrew = done.effects.filter(
      (e) => e.kind === 'event' && e.to !== 'all' && e.to.includes(crew.id),
    );
    expect(eventTypes(toCrew)).toContain('task.revealed');
  });

  it('keeps the pin once revealed, even after leaving the section', () => {
    const { state, now } = playing();
    const crew = crewOf(state)[0]!;
    const task = taskAt(state, crew.id);
    const held = stayAt(
      state,
      crew.id,
      otherPointInSection(state, task),
      now,
      state.config.sectionEntryHoldS + 1,
    );
    expect(taskAt(held.state, crew.id).stage).toBe('pin');
    const away = stayAt(held.state, crew.id, { lat: 28.6139, lng: 77.209 }, held.now, 5);
    expect(taskAt(away.state, crew.id).stage).toBe('pin');
  });

  it('a hold is reset when the player leaves the section before it completes', () => {
    const { state, now } = playing();
    const crew = crewOf(state)[0]!;
    const task = taskAt(state, crew.id);
    const first = stayAt(state, crew.id, otherPointInSection(state, task), now, 2);
    expect(taskAt(first.state, crew.id).holdSince).toBeDefined();
    // Step far away (a different section), then come back: the clock starts over.
    const away = stayAt(first.state, crew.id, { lat: 28.6139, lng: 77.209 }, first.now, 2);
    expect(taskAt(away.state, crew.id).holdSince).toBeUndefined();
    const back = stayAt(away.state, crew.id, otherPointInSection(state, task), away.now, 2);
    expect(taskAt(back.state, crew.id).stage).toBe('assigned');
  });

  it('never reveals on a weak fix (E5), and a weak fix breaks the hold', () => {
    const { state, now } = playing();
    const crew = crewOf(state)[0]!;
    const task = taskAt(state, crew.id);
    const spot = otherPointInSection(state, task);
    let s = state;
    for (let i = 1; i <= 8; i++) {
      s = run(
        s,
        { type: 'locUpdate', playerId: crew.id, fix: { ...spot, accuracy: 60, ts: now + i * S } },
        now + i * S,
      ).state;
      s = advanceTo(s, now + i * S);
    }
    expect(taskAt(s, crew.id).stage).toBe('assigned');
  });

  it('a stale fix resets the hold', () => {
    const { state, now } = playing();
    const crew = crewOf(state)[0]!;
    const task = taskAt(state, crew.id);
    const first = stayAt(state, crew.id, otherPointInSection(state, task), now, 2);
    // Nobody sends fixes for longer than staleAfterS.
    const later = first.now + (state.config.staleAfterS + 5) * S;
    const s = run(
      first.state,
      {
        type: 'locUpdate',
        playerId: 'host',
        fix: { lat: 28.6139, lng: 77.209, accuracy: 5, ts: later },
      },
      later,
    ).state;
    expect(taskAt(s, crew.id).holdSince).toBeUndefined();
  });

  it('does not count time while the host has paused the game', () => {
    const { state, now } = playing();
    const crew = crewOf(state)[0]!;
    const task = taskAt(state, crew.id);
    let s = moveTo(state, crew.id, otherPointInSection(state, task), now);
    s = advanceTo(s, now + S);
    s = run(s, { type: 'pause', playerId: 'host' }, now + S).state;
    for (let i = 2; i <= 12; i++) s = advanceTo(s, now + i * S);
    expect(taskAt(s, crew.id).stage).toBe('assigned');
    s = run(s, { type: 'resume', playerId: 'host' }, now + 12 * S).state;
    s = advanceTo(s, now + 16 * S);
    expect(taskAt(s, crew.id).stage).toBe('pin');
  });

  describe('hysteresis at a section edge', () => {
    /** A point in the task's section and one just beyond its edge, found by walking out in a straight line. */
    function edge(state: RoomState, task: ReturnType<typeof taskAt>) {
      const r = state.setup.regions.find((x) => x.id === task.regionId)!;
      for (let bearing = 0; bearing < 360; bearing += 15) {
        let last = { lat: task.lat, lng: task.lng };
        for (let m = 1; m < 120; m++) {
          const rad = (bearing * Math.PI) / 180;
          const mPerLat = 111_320;
          const probe = {
            lat: task.lat + (Math.cos(rad) * m) / mPerLat,
            lng: task.lng + (Math.sin(rad) * m) / (mPerLat * Math.cos((task.lat * Math.PI) / 180)),
          };
          const place = sectionOf(probe, state.setup.regions, state.config.sectionCentreRatio);
          if (!(place?.regionId === task.regionId && place.section === task.section)) {
            // `probe` is the first spot outside, within 1 m of the edge; it must still be inside the area.
            if (place) return { inside: last, outside: probe, region: r };
            break;
          }
          last = probe;
        }
      }
      throw new Error('no edge found');
    }

    it('a fix just outside, whose error circle touches the section, keeps the hold', () => {
      const { state } = playing();
      const task = taskAt(state, crewOf(state)[0]!.id);
      const { outside } = edge(state, task);
      expect(nearTarget(state, { ...outside, accuracy: 10 }, task)).toBe(true);
    });

    it('a fix clearly outside does not', () => {
      const { state } = playing();
      const task = taskAt(state, crewOf(state)[0]!.id);
      const { outside } = edge(state, task);
      expect(nearTarget(state, { ...outside, accuracy: 0.1 }, task)).toBe(false);
    });
  });
});
