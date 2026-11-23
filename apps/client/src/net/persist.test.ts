import { describe, expect, it } from 'vitest';

import { clearSession, loadSession, saveSession } from './persist';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('session persistence', () => {
  it('round-trips {token, code}', () => {
    const s = memoryStorage();
    saveSession({ token: 'tok', code: 'ABC234' }, s);
    expect(loadSession(s)).toEqual({ token: 'tok', code: 'ABC234' });
    clearSession(s);
    expect(loadSession(s)).toBeUndefined();
  });

  it('ignores corrupt or wrongly shaped data', () => {
    const s = memoryStorage();
    s.data.set('afterdark.session', '{not json');
    expect(loadSession(s)).toBeUndefined();
    s.data.set('afterdark.session', JSON.stringify({ token: 1 }));
    expect(loadSession(s)).toBeUndefined();
  });

  it('never throws when storage is blocked or missing', () => {
    expect(() => saveSession({ token: 't', code: 'c' }, throwing)).not.toThrow();
    expect(loadSession(throwing)).toBeUndefined();
    expect(() => clearSession(throwing)).not.toThrow();
    expect(loadSession(undefined)).toBeUndefined();
  });
});
