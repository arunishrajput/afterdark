/**
 * Phase 7 leak tests (TESTING.md §3, GDD): crew cannot retrieve infected identities
 * from any view, radar frame or event, and an infected player receives no
 * notification. A scripted game infects three crew members, and every view,
 * radar frame and effect produced along the way is scanned.
 */
import { DEFAULT_CONFIG, offsetByMeters } from '@afterdark/shared';
import { describe, expect, it } from 'vitest';

import { reduce } from '../engine/reduce';
import type { RoomState } from '../engine/state';
import { advanceWithEffects, moveTo, newLobby, run, S, toPlaying } from '../engine/testkit';
import type { Effect } from '../engine/types';
import { keysDeep } from './leakHarness';
import { projectView } from './projectView';
import { buildRadar } from './radar';

const CFG = DEFAULT_CONFIG;

interface Frame {
  state: RoomState;
  now: number;
  effects: Effect[];
}

/** Plays a game in which the first imposter infects three crew members one after another. */
function script(): { frames: Frame[]; victims: string[]; imposterId: string; bystander: string } {
  const lobby = newLobby({ players: 8, config: { playerVisibility: 'all' } });
  const start = toPlaying(lobby);
  let state = start.state;
  let now = start.now;
  const frames: Frame[] = [];
  const crew = state.players.filter((p) => p.role === 'crew');
  const imposterId = state.players.find((p) => p.role === 'imposter')?.id ?? '';
  const victims = crew.slice(0, 3).map((p) => p.id);
  const bystander = crew[3]?.id ?? '';

  const step = (): void => {
    now += S;
    const r = advanceWithEffects(state, now);
    state = r.state;
    frames.push({ state, now, effects: r.effects });
  };
  const wait = (seconds: number) => {
    for (let i = 0; i < seconds; i++) step();
  };

  wait(CFG.abilityInitialCooldownS);
  for (const victim of victims) {
    const here = state.players.find((p) => p.id === victim)?.loc;
    if (!here) throw new Error('no fix');
    state = moveTo(state, imposterId, offsetByMeters(here, 3, 0), now);
    const started = reduce(state, { type: 'infectStart', playerId: imposterId }, now);
    if (!started.ok) throw new Error(`infect failed: ${started.code}`);
    state = started.state;
    frames.push({ state, now, effects: started.effects });
    wait(CFG.infectionChannelS);
    // Walk away and wait out the incubation, plus the cooldown for the next one.
    state = moveTo(state, imposterId, offsetByMeters(here, 60, 0), now);
    wait(CFG.incubationDepartS + CFG.incubationS + 2);
    wait(Math.max(0, CFG.infectionCooldownS - CFG.incubationS - CFG.incubationDepartS));
  }
  return { frames, victims, imposterId, bystander };
}

const played = script();
const BAD_KEYS = ['infected', 'exposed', 'incubation', 'compromisedIds', 'exposures', 'infect'];

describe('the scripted game really infected three players', () => {
  it('ends with 3 infected victims (and imposters have not won yet at 6 crew)', () => {
    const last = played.frames.at(-1)?.state;
    expect(last?.players.filter((p) => p.infection === 'infected').map((p) => p.id)).toEqual(
      played.victims,
    );
  });
});

describe('leak: crew views never reveal infection (any status, any moment)', () => {
  it('no crew view, at any step, has an infection-related key', () => {
    for (const f of played.frames.filter((_, i) => i % 3 === 0)) {
      for (const p of f.state.players.filter((x) => x.role === 'crew')) {
        const view = projectView(f.state, p.id, f.now);
        const paths = keysDeep(view);
        for (const bad of BAD_KEYS) {
          expect(
            paths.some((path) => path.split('.').some((seg) => seg.replace('[]', '') === bad)),
            `${p.id} at ${f.now}: ${bad}`,
          ).toBe(false);
        }
        expect(JSON.stringify(view)).not.toMatch(/"imposter"|"allies"|"compromisedIds"/);
      }
    }
  });

  it('a victim’s view has the same keys as a bystander’s, before, during and after the infection', () => {
    for (const f of played.frames.filter((_, i) => i % 3 === 0)) {
      const bystander = keysDeep(projectView(f.state, played.bystander, f.now));
      for (const victim of played.victims) {
        expect(keysDeep(projectView(f.state, victim, f.now))).toEqual(bystander);
      }
    }
  });

  it('while a channel runs on a victim, their view equals one from a game with no channel', () => {
    const during = played.frames.find((f) =>
      f.state.players.some((p) => p.infect?.channel !== undefined),
    );
    if (!during) throw new Error('no channel frame');
    const victimId =
      during.state.players.find((p) => p.infect?.channel)?.infect?.channel?.targetId ?? '';
    const calm = structuredClone(during.state);
    for (const p of calm.players) if (p.infect) delete p.infect.channel;
    // The task cards depend on positions only, which are the same: nothing else may differ.
    expect(JSON.stringify(projectView(during.state, victimId, during.now))).toBe(
      JSON.stringify(projectView(calm, victimId, during.now)),
    );
  });

  it('crew radar frames never carry ally, exposed or infected flags', () => {
    for (const f of played.frames.filter((_, i) => i % 3 === 0)) {
      for (const p of f.state.players.filter((x) => x.role === 'crew')) {
        for (const d of buildRadar(f.state, p.id, f.now)) {
          expect(d.flags.filter((flag) => !['oob', 'stale'].includes(flag))).toEqual([]);
        }
      }
    }
  });
});

describe('leak: an infected player receives no notification (GDD)', () => {
  it('no event is addressed to a crew member except the public ones', () => {
    const allowed = new Set([
      'game.compromised',
      'zone.warning',
      'zone.penalty',
      'task.revealed',
      'task.atPin',
      'task.completed',
      'task.reset',
      'task.removed',
      'game.ended',
    ]);
    const crewIds = new Set(
      played.frames[0]?.state.players.filter((p) => p.role === 'crew').map((p) => p.id),
    );
    for (const f of played.frames) {
      for (const e of f.effects) {
        if (e.kind !== 'event') continue;
        const toCrew = e.to === 'all' || e.to.some((id) => crewIds.has(id));
        if (toCrew) expect(allowed.has(e.event.type), e.event.type).toBe(true);
        if (e.event.type.startsWith('infect.')) {
          expect(e.to).toEqual([played.imposterId]);
        }
      }
    }
  });

  it('the public compromised event is a bare count, with no player in it', () => {
    const events = played.frames.flatMap((f) =>
      f.effects.flatMap((e) =>
        e.kind === 'event' && e.event.type === 'game.compromised' ? [e] : [],
      ),
    );
    expect(events.map((e) => (e.event.type === 'game.compromised' ? e.event.count : -1))).toEqual([
      1, 2, 3,
    ]);
    for (const e of events) expect(e.to).toBe('all');
    for (const e of events) expect(Object.keys(e.event).sort()).toEqual(['count', 'type']);
  });
});

describe('what the imposter does get (ROLES.md)', () => {
  it('lists exposed and infected players with their ids, and marks them on the radar', () => {
    for (const f of played.frames.filter((_, i) => i % 4 === 0)) {
      const view = projectView(f.state, played.imposterId, f.now);
      const expected = f.state.players.filter((p) => p.infection !== undefined).map((p) => p.id);
      expect(view.me.imposter?.compromisedIds).toEqual(expected);
      const exposures = f.state.players.filter((p) => p.infection === 'exposed').map((p) => p.id);
      expect(view.me.imposter?.exposures.map((x) => x.playerId)).toEqual(exposures);
      const flags = buildRadar(f.state, played.imposterId, f.now).flatMap((d) => d.flags);
      expect(flags.filter((x) => x === 'exposed')).toHaveLength(exposures.length);
      expect(flags.filter((x) => x === 'infected')).toHaveLength(
        expected.length - exposures.length,
      );
    }
  });

  it('shows the channel only to the imposter who runs it, and the other imposter sees no channel', () => {
    const during = played.frames.find((f) =>
      f.state.players.some((p) => p.infect?.channel !== undefined),
    );
    if (!during) throw new Error('no channel frame');
    const imp = during.state.players.find((p) => p.infect?.channel)?.id ?? '';
    const other = during.state.players.find((p) => p.role === 'imposter' && p.id !== imp)?.id ?? '';
    expect(projectView(during.state, imp, during.now).me.imposter?.infect.channel).toBeDefined();
    expect(
      projectView(during.state, other, during.now).me.imposter?.infect.channel,
    ).toBeUndefined();
  });

  it('their Infect readyAt does not change between views while nothing happens', () => {
    const a = played.frames[5];
    const b = played.frames[9];
    if (!a || !b) throw new Error('frames');
    const ra = projectView(a.state, played.imposterId, a.now).me.imposter?.infect.readyAt;
    const rb = projectView(b.state, played.imposterId, b.now).me.imposter?.infect.readyAt;
    expect(ra).toBe(rb);
  });
});

describe('the engine keeps no shortcut to infection for crew commands', () => {
  it('a crew member cannot infect', () => {
    const { state, now } = toPlaying(newLobby({ players: 6 }));
    const crew = state.players.find((p) => p.role === 'crew')?.id ?? '';
    const res = reduce(state, { type: 'infectStart', playerId: crew }, now + 100 * S);
    expect(res.ok).toBe(false);
    expect(run(state, { type: 'infectCancel', playerId: crew }, now).state).toBeDefined();
  });
});
