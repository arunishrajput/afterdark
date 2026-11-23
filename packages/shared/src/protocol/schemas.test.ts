import { describe, expect, it } from 'vitest';

import {
  lobbyCodeSchema,
  lobbyCreateSchema,
  lobbyJoinSchema,
  lobbyKickSchema,
  lobbyLeaveSchema,
  lobbySetReadySchema,
  lobbyUpdateConfigSchema,
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
