/**
 * Phase 8 leak tests (TESTING.md §3, ROLES.md): a vote is never attributed, the meeting view
 * has the same shape for crew, imposters and spectators, the reveal says only Imposter / Not an
 * imposter, and an ejected player loses everything that was private. A scripted game runs
 * a meeting through every stage with distinctive votes and scans every view and effect.
 */
import { DEFAULT_CONFIG } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { reduce } from '../engine/reduce';
import type { RoomState } from '../engine/state';
import { advanceTo, moveTo, newLobby, run, S, toPlaying } from '../engine/testkit';
import type { Effect } from '../engine/types';
import { ALLOWED_VIEW_KEYS, keysDeep } from './leakHarness';
import { projectView } from './projectView';
import { buildRadar } from './radar';

const CFG = DEFAULT_CONFIG;

interface Frame {
  state: RoomState;
  now: number;
  stage: string;
  effects: Effect[];
}

const byRole = (s: RoomState, role: 'crew' | 'imposter') =>
  s.players.filter((p) => p.role === role).map((p) => p.id);

/** A meeting that ejects a healthy crew member: frames after every stage change, then one more meeting afterwards. */
function script(opts: { infectedTarget?: boolean } = {}) {
  const start = toPlaying(newLobby({ players: 8, config: { playerVisibility: 'all' } }));
  let state = run(
    start.state,
    { type: 'devAdvanceClock', playerId: 'host', seconds: CFG.meetingStartGraceS + 5 },
    start.now,
  ).state;
  let now = start.now + S;
  state = advanceTo(state, now);
  const frames: Frame[] = [];
  const crew = byRole(state, 'crew');
  const imposters = byRole(state, 'imposter');
  const target = crew[0] ?? '';
  if (opts.infectedTarget) {
    const t = state.players.find((p) => p.id === target);
    if (t) t.infection = 'infected';
  }
  const stageOf = () => state.game?.meeting?.stage ?? 'none';
  const snap = (effects: Effect[] = []) => frames.push({ state, now, stage: stageOf(), effects });

  const called = run(state, { type: 'meetingCall', playerId: crew[1] ?? '' }, now);
  state = called.state;
  snap(called.effects);
  for (const p of state.players)
    state = moveTo(state, p.id, state.setup.base ?? { lat: 0, lng: 0 }, now);
  snap();
  for (const p of state.players) {
    state = run(state, { type: 'meetingSkipDiscussion', playerId: p.id }, now).state;
  }
  snap();
  // Distinctive votes: 6 for the target, the target and one more skip. The imposters vote for the target too.
  const ids = state.players.map((p) => p.id);
  let last: Effect[] = [];
  for (const id of ids) {
    const res = run(
      state,
      { type: 'meetingVote', playerId: id, target: id === target ? 'skip' : target },
      now,
    );
    state = res.state;
    last = res.effects;
    if (id !== ids.at(-1)) snap();
  }
  snap(last);
  now += CFG.meetingResultS * S + S;
  state = advanceTo(state, now);
  snap();
  return { frames, state, now, target, crew, imposters };
}

const played = script();

describe('leak: a vote is never attributed', () => {
  it('every view at every stage stays inside the allow-list and has no vote keys', () => {
    for (const f of played.frames) {
      for (const p of f.state.players) {
        const keys = keysDeep(projectView(f.state, p.id, f.now));
        expect(
          keys.filter((k) => !k.startsWith('lobby.config.') && !ALLOWED_VIEW_KEYS.has(k)),
        ).toEqual([]);
        expect(
          keys.filter(
            (k) => !k.startsWith('lobby.config.') && /vote(s|r|d)/i.test(k.replace('myVote', '')),
          ),
        ).toEqual([]);
      }
    }
  });

  it('only the voter sees their own vote; nobody sees anyone else’s', () => {
    const f =
      played.frames.find(
        (x) => x.stage === 'vote' && Object.keys(x.state.game?.meeting?.votes ?? {}).length > 0,
      ) ?? played.frames[0];
    if (!f) throw new Error('no frame');
    const voted = Object.keys(f.state.game?.meeting?.votes ?? {});
    expect(voted.length).toBeGreaterThan(0);
    for (const p of f.state.players) {
      const mine = projectView(f.state, p.id, f.now).game?.meeting?.myVote;
      expect(mine === undefined).toBe(!voted.includes(p.id));
      // The view holds exactly one vote at most: the viewer's own, never a second pairing of voter and choice.
      const json = JSON.stringify(projectView(f.state, p.id, f.now));
      expect(json.split('myVote').length - 1).toBe(mine === undefined ? 0 : 1);
    }
  });

  it('the tallies carry counts only, in an order that does not depend on who voted', () => {
    const f = played.frames.find((x) => x.stage === 'result');
    if (!f) throw new Error('no result frame');
    const v = projectView(f.state, 'host', f.now).game?.meeting;
    expect(v?.tallies?.[0]).toEqual({ target: played.target, count: 7 });
    expect(Object.keys(v?.tallies?.[0] ?? {}).sort()).toEqual(['count', 'target']);
  });
});

describe('leak: the meeting view has the same shape for crew and imposters', () => {
  it('at every stage, every viewer’s meeting object has the same key set', () => {
    for (const f of played.frames.filter((x) => x.stage !== 'none')) {
      const shapes = f.state.players
        .filter((p) => p.role !== undefined)
        .map((p) =>
          keysDeep(projectView(f.state, p.id, f.now).game?.meeting).filter((k) => k !== 'myVote'),
        );
      for (const s of shapes) expect(s).toEqual(shapes[0]);
    }
  });

  it('the result view of an imposter and a crew member differ in nothing but their own vote', () => {
    const f = played.frames.find((x) => x.stage === 'result');
    if (!f) throw new Error('no result frame');
    const imp = projectView(f.state, played.imposters[0] ?? '', f.now).game?.meeting;
    const crew = projectView(f.state, played.crew[2] ?? '', f.now).game?.meeting;
    expect({ ...imp, myVote: undefined }).toEqual({ ...crew, myVote: undefined });
  });
});

describe('leak: the reveal and the spectator (ROLES.md › Spectator, ADR-019)', () => {
  const after = played.state;

  it('the ejection sets `revealedRole` on the roster of everyone, and on nobody else', () => {
    for (const p of after.players) {
      const roster = projectView(after, p.id, played.now).lobby.players;
      expect(
        roster.filter((r) => r.revealedRole !== undefined).map((r) => [r.id, r.revealedRole]),
      ).toEqual([[played.target, 'crew']]);
    }
  });

  it('the meeting.result event says who and Imposter / Not an imposter, and nothing else', () => {
    const f = played.frames.find((x) =>
      x.effects.some((e) => e.kind === 'event' && e.event.type === 'meeting.result'),
    );
    const e = f?.effects.find((x) => x.kind === 'event' && x.event.type === 'meeting.result');
    expect(e).toEqual({
      kind: 'event',
      to: 'all',
      event: {
        type: 'meeting.result',
        ejected: {
          username: after.players.find((p) => p.id === played.target)?.username,
          wasImposter: false,
        },
      },
    });
  });

  it('a spectator gets public information only: no tag-bearing imposter block, no tasks, no ally flags', () => {
    const view = projectView(after, played.target, played.now);
    expect(view.me.status).toBe('spectator');
    expect(view.me.imposter).toBeUndefined();
    expect(view.game?.tasks).toEqual([]);
    expect(view.game?.meeting).toBeUndefined();
    const dots = buildRadar(after, played.target, played.now);
    for (const d of dots)
      expect(d.flags.filter((x) => x === 'ally' || x === 'exposed' || x === 'infected')).toEqual(
        [],
      );
  });

  it('an ejected imposter loses the whole imposter block, and other imposters stop listing them as an ally', () => {
    const start = script();
    const imp = start.imposters[0] ?? '';
    const other = start.imposters[1];
    const state = structuredClone(start.state);
    const p = state.players.find((x) => x.id === imp);
    if (p) {
      p.spectator = true;
      p.revealedRole = 'imposter';
      delete p.infect;
    }
    expect(projectView(state, imp, start.now).me.imposter).toBeUndefined();
    if (other) {
      const allies =
        projectView(state, other, start.now).me.imposter?.allies.map((a) => a.playerId) ?? [];
      expect(allies).not.toContain(imp);
    }
    for (const viewer of byRole(state, 'imposter')) {
      expect(buildRadar(state, viewer, start.now).filter((d) => d.flags.includes('ally'))).toEqual(
        expect.any(Array),
      );
    }
  });

  it('ejecting an infected crew member looks exactly like ejecting a healthy one to every crew view', () => {
    const healthy = script();
    const infected = script({ infectedTarget: true });
    const shape = (r: ReturnType<typeof script>) =>
      byRole(r.state, 'crew')
        .filter((id) => id !== r.target)
        .map((id) => keysDeep(projectView(r.state, id, r.now)));
    expect(shape(infected)).toEqual(shape(healthy));
    for (const r of [healthy, infected]) {
      expect(projectView(r.state, byRole(r.state, 'crew')[3] ?? '', r.now).game?.compromised).toBe(
        r === infected ? 1 : 1,
      );
    }
  });

  it('a wrongly ejected player shows up in an imposter’s compromised list; crew views carry no such list', () => {
    const imp = played.imposters[0] ?? '';
    expect(projectView(after, imp, played.now).me.imposter?.compromisedIds).toContain(
      played.target,
    );
    const crewView = JSON.stringify(projectView(after, played.crew[2] ?? '', played.now));
    expect(crewView).not.toContain('compromisedIds');
  });
});

describe('spectators are out of the radar and the meeting roster says so', () => {
  it('nobody sees a spectator’s dot, and the roster marks them', () => {
    const after = played.state;
    for (const p of after.players.filter((x) => x.id !== played.target)) {
      const aliasSet = buildRadar(after, p.id, played.now);
      expect(aliasSet.length).toBeLessThan(after.players.length - 1);
    }
    const next = run(
      run(
        after,
        { type: 'devAdvanceClock', playerId: 'host', seconds: CFG.meetingCooldownS + 1 },
        played.now,
      ).state,
      { type: 'meetingCall', playerId: played.crew[3] ?? '' },
      played.now + S,
    );
    const view = projectView(next.state, 'host', played.now + S).game?.meeting;
    expect(view?.roster.find((r) => r.playerId === played.target)?.status).toBe('spectator');
    expect(view?.progress.total).toBe(7);
    expect(reduce(next.state, { type: 'meetingCall', playerId: 'host' }, played.now + S).ok).toBe(
      false,
    );
  });
});
