import { describe, expect, it } from 'vitest';

import {
  devAddBotsSchema,
  devTeleportSchema,
  gameCommandSchema,
  lobbyCodeSchema,
  lobbyCreateSchema,
  lobbyEditTaskPointsSchema,
  lobbyJoinSchema,
  lobbyKickSchema,
  lobbyLeaveSchema,
  lobbyRegenerateRegionsSchema,
  lobbyRenameRegionSchema,
  lobbySetBaseSchema,
  lobbySetBoundarySchema,
  lobbySetNoGoZonesSchema,
  lobbySetReadySchema,
  lobbyUpdateConfigSchema,
  locUpdateSchema,
  sessionResumeSchema,
  timePingSchema,
  usernameSchema,
} from './schemas';

describe('timePingSchema', () => {
  it('accepts a numeric clientTs', () => {
    expect(timePingSchema.parse({ clientTs: 123 })).toEqual({ clientTs: 123 });
  });

  it('rejects missing, non-numeric, non-finite or extra fields', () => {
    expect(timePingSchema.safeParse({}).success).toBe(false);
    expect(timePingSchema.safeParse({ clientTs: '1' }).success).toBe(false);
    expect(timePingSchema.safeParse({ clientTs: Infinity }).success).toBe(false);
    expect(timePingSchema.safeParse({ clientTs: 1, x: 2 }).success).toBe(false);
  });
});

describe('usernameSchema', () => {
  const ok = (input: string) => usernameSchema.safeParse(input);

  it('accepts letters, digits, space, underscore, dot and hyphen', () => {
    expect(ok('Ab').data).toBe('Ab');
    expect(ok('night_owl.42-x').data).toBe('night_owl.42-x');
    expect(ok('Zoë Ünal').data).toBe('Zoë Ünal');
  });

  it('accepts scripts that need combining marks (Devanagari)', () => {
    expect(ok('अरुण').success).toBe(true);
  });

  it('trims and collapses inner whitespace before checking length', () => {
    expect(ok('  Raven  ').data).toBe('Raven');
    expect(ok('a   b').data).toBe('a b');
    expect(ok('  a ').success).toBe(false); // 1 char after trimming
  });

  it('normalises to NFC so look-alike encodings compare equal', () => {
    const decomposed = 'Zoë'; // e + combining diaeresis
    expect(ok(decomposed).data).toBe('Zoë');
  });

  it('enforces 2–16 characters, counted in code points', () => {
    expect(ok('a').success).toBe(false);
    expect(ok('a'.repeat(16)).success).toBe(true);
    expect(ok('a'.repeat(17)).success).toBe(false);
    expect(ok('é'.repeat(16)).success).toBe(true);
  });

  it('rejects other characters (markup, emoji, punctuation, control)', () => {
    for (const bad of ['<b>hi</b>', 'cool😎', 'a/b', 'semi;colon', 'tab\tname', 'quote"s']) {
      expect(ok(bad).success, bad).toBe(false);
    }
  });

  it('rejects non-strings', () => {
    expect(usernameSchema.safeParse(42).success).toBe(false);
    expect(usernameSchema.safeParse(undefined).success).toBe(false);
  });
});

describe('lobbyCodeSchema', () => {
  it('accepts 6 characters from the code alphabet, upper-casing and trimming', () => {
    expect(lobbyCodeSchema.parse('ABC234')).toBe('ABC234');
    expect(lobbyCodeSchema.parse(' abc234 ')).toBe('ABC234');
  });

  it('rejects wrong lengths and confusable characters (0, O, 1, I)', () => {
    for (const bad of ['ABC23', 'ABC2345', 'ABC230', 'ABCO23', 'ABC123', 'ABCI23', 'AB-234']) {
      expect(lobbyCodeSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('lobby event payloads', () => {
  it('lobby:create needs a username and acceptedSafety === true', () => {
    expect(lobbyCreateSchema.safeParse({ username: 'Ann', acceptedSafety: true }).success).toBe(
      true,
    );
    expect(lobbyCreateSchema.safeParse({ username: 'Ann', acceptedSafety: false }).success).toBe(
      false,
    );
    expect(lobbyCreateSchema.safeParse({ username: 'Ann' }).success).toBe(false);
  });

  it('lobby:join needs a valid code, username and acceptedSafety === true', () => {
    const base = { code: 'abc234', username: ' Ann ', acceptedSafety: true as const };
    expect(lobbyJoinSchema.parse(base)).toEqual({
      code: 'ABC234',
      username: 'Ann',
      acceptedSafety: true,
    });
    expect(lobbyJoinSchema.safeParse({ ...base, acceptedSafety: false }).success).toBe(false);
    expect(lobbyJoinSchema.safeParse({ ...base, code: 'nope' }).success).toBe(false);
    expect(lobbyJoinSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });

  it('session:resume needs a URL-safe token of sane length', () => {
    expect(sessionResumeSchema.safeParse({ token: 'a'.repeat(22) }).success).toBe(true);
    expect(sessionResumeSchema.safeParse({ token: 'short' }).success).toBe(false);
    expect(sessionResumeSchema.safeParse({ token: 'a'.repeat(65) }).success).toBe(false);
    expect(sessionResumeSchema.safeParse({ token: `${'a'.repeat(20)} !` }).success).toBe(false);
  });

  it('lobby:leave takes an empty object only', () => {
    expect(lobbyLeaveSchema.safeParse({}).success).toBe(true);
    expect(lobbyLeaveSchema.safeParse({ now: true }).success).toBe(false);
  });

  it('lobby:setReady takes a boolean', () => {
    expect(lobbySetReadySchema.safeParse({ ready: true }).success).toBe(true);
    expect(lobbySetReadySchema.safeParse({ ready: 'yes' }).success).toBe(false);
  });

  it('lobby:updateConfig accepts editable keys in range and rejects the rest', () => {
    expect(lobbyUpdateConfigSchema.safeParse({ patch: { playTimeMin: 15 } }).success).toBe(true);
    expect(lobbyUpdateConfigSchema.safeParse({ patch: { playTimeMin: 5 } }).success).toBe(false);
    expect(lobbyUpdateConfigSchema.safeParse({ patch: { maxPlayers: 20 } }).success).toBe(false);
    expect(lobbyUpdateConfigSchema.safeParse({ patch: {} }).success).toBe(true);
  });

  it('lobby:kick needs a player id', () => {
    expect(lobbyKickSchema.safeParse({ playerId: 'p'.repeat(16) }).success).toBe(true);
    expect(lobbyKickSchema.safeParse({ playerId: '' }).success).toBe(false);
  });
});

describe('Phase 2 schemas', () => {
  const fix = { lat: 28.6, lng: 77.2, accuracy: 12, ts: 1_700_000_000_000 };

  it('locUpdate accepts a fix and optional heading/speed', () => {
    expect(locUpdateSchema.safeParse(fix).success).toBe(true);
    expect(locUpdateSchema.safeParse({ ...fix, heading: 90, speed: 1.4 }).success).toBe(true);
  });

  it('locUpdate rejects bad coordinates, negative accuracy and unknown keys', () => {
    for (const bad of [
      { ...fix, lat: 91 },
      { ...fix, lng: -181 },
      { ...fix, accuracy: -1 },
      { ...fix, ts: Number.NaN },
      { ...fix, extra: 1 },
      { ...fix, heading: 400 },
    ]) {
      expect(locUpdateSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('lobbySetBoundary accepts a polygon or a circle', () => {
    const poly = {
      boundary: {
        type: 'polygon',
        coords: [
          [77.2, 28.6],
          [77.21, 28.6],
          [77.21, 28.61],
        ],
      },
    };
    const circle = { boundary: { type: 'circle', center: { lat: 28.6, lng: 77.2 }, radiusM: 100 } };
    expect(lobbySetBoundarySchema.safeParse(poly).success).toBe(true);
    expect(lobbySetBoundarySchema.safeParse(circle).success).toBe(true);
  });

  it('lobbySetBoundary rejects too few / too many points and silly circles', () => {
    const coords = (n: number) => Array.from({ length: n }, (_, i) => [77 + i * 1e-5, 28]);
    expect(
      lobbySetBoundarySchema.safeParse({ boundary: { type: 'polygon', coords: coords(2) } })
        .success,
    ).toBe(false);
    expect(
      lobbySetBoundarySchema.safeParse({ boundary: { type: 'polygon', coords: coords(501) } })
        .success,
    ).toBe(false);
    expect(
      lobbySetBoundarySchema.safeParse({
        boundary: { type: 'circle', center: { lat: 0, lng: 0 }, radiusM: 0 },
      }).success,
    ).toBe(false);
    expect(
      lobbySetBoundarySchema.safeParse({
        boundary: { type: 'circle', center: { lat: 0, lng: 0 }, radiusM: 50_000 },
      }).success,
    ).toBe(false);
  });

  it('devTeleport takes a lat/lng only', () => {
    expect(devTeleportSchema.safeParse({ lat: 1, lng: 2 }).success).toBe(true);
    expect(devTeleportSchema.safeParse({ lat: 1, lng: 2, x: 1 }).success).toBe(false);
  });

  describe('Phase 3 setup payloads', () => {
    it('regenerateRegions takes an optional count (auto or 2–6) and seed', () => {
      expect(lobbyRegenerateRegionsSchema.safeParse({}).success).toBe(true);
      expect(lobbyRegenerateRegionsSchema.safeParse({ regionCount: 'auto', seed: 5 }).success).toBe(
        true,
      );
      for (const bad of [
        { regionCount: 1 },
        { regionCount: 7 },
        { regionCount: 2.5 },
        { seed: -1 },
        { x: 1 },
      ]) {
        expect(lobbyRegenerateRegionsSchema.safeParse(bad).success).toBe(false);
      }
    });

    it('renameRegion normalises the name and enforces the length and charset', () => {
      const parsed = lobbyRenameRegionSchema.parse({ regionId: 'r1', name: '  The   Quad ' });
      expect(parsed.name).toBe('The Quad');
      expect(lobbyRenameRegionSchema.safeParse({ regionId: 'r1', name: '' }).success).toBe(false);
      expect(
        lobbyRenameRegionSchema.safeParse({ regionId: 'r1', name: 'x'.repeat(21) }).success,
      ).toBe(false);
      expect(
        lobbyRenameRegionSchema.safeParse({ regionId: 'r1', name: 'x'.repeat(20) }).success,
      ).toBe(true);
      expect(lobbyRenameRegionSchema.safeParse({ regionId: 'r1', name: '<b>' }).success).toBe(
        false,
      );
      expect(lobbyRenameRegionSchema.safeParse({ regionId: 'a b', name: 'ok' }).success).toBe(
        false,
      );
    });

    it('editTaskPoints limits how much one call may add or remove', () => {
      const pt = { lat: 1, lng: 2 };
      expect(
        lobbyEditTaskPointsSchema.safeParse({ add: [pt], remove: ['p1'], regenerate: true })
          .success,
      ).toBe(true);
      expect(lobbyEditTaskPointsSchema.safeParse({ add: Array(21).fill(pt) }).success).toBe(false);
      expect(lobbyEditTaskPointsSchema.safeParse({ add: [{ lat: 91, lng: 0 }] }).success).toBe(
        false,
      );
      expect(lobbyEditTaskPointsSchema.safeParse({ remove: ['../x'] }).success).toBe(false);
    });

    it('setNoGoZones takes up to 20 zones of 3–200 corners; setBase a lat/lng', () => {
      const tri = [
        [0, 0],
        [0, 1],
        [1, 1],
      ];
      expect(lobbySetNoGoZonesSchema.safeParse({ zones: [] }).success).toBe(true);
      expect(lobbySetNoGoZonesSchema.safeParse({ zones: [tri] }).success).toBe(true);
      expect(lobbySetNoGoZonesSchema.safeParse({ zones: [tri.slice(0, 2)] }).success).toBe(false);
      expect(lobbySetNoGoZonesSchema.safeParse({ zones: Array(21).fill(tri) }).success).toBe(false);
      expect(lobbySetBaseSchema.safeParse({ lat: 1, lng: 2 }).success).toBe(true);
      expect(lobbySetBaseSchema.safeParse({ lat: 1 }).success).toBe(false);
    });
  });
});

describe('Phase 4 payloads', () => {
  it('game commands carry nothing', () => {
    expect(gameCommandSchema.safeParse({}).success).toBe(true);
    expect(gameCommandSchema.safeParse({ x: 1 }).success).toBe(false);
  });

  it('dev:addBots takes an integer count of 1 to 11', () => {
    expect(devAddBotsSchema.safeParse({ count: 7 }).success).toBe(true);
    expect(devAddBotsSchema.safeParse({ count: 0 }).success).toBe(false);
    expect(devAddBotsSchema.safeParse({ count: 12 }).success).toBe(false);
    expect(devAddBotsSchema.safeParse({ count: 2.5 }).success).toBe(false);
    expect(devAddBotsSchema.safeParse({ count: 3, extra: 1 }).success).toBe(false);
  });
});
