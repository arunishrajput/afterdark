/**
 * The device's session `{token, code}` in localStorage (ARCHITECTURE §6).
 * Storage can throw (private mode, blocked site data), so every access is
 * wrapped and failure just means "no saved session".
 */
const KEY = 'afterdark.session';

export interface SavedSession {
  token: string;
  code: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const defaultStorage = (): StorageLike | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export function loadSession(storage = defaultStorage()): SavedSession | undefined {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'token' in parsed &&
      'code' in parsed &&
      typeof parsed.token === 'string' &&
      typeof parsed.code === 'string'
    ) {
      return { token: parsed.token, code: parsed.code };
    }
  } catch {
    // unreadable or corrupt: treat as no session
  }
  return undefined;
}

export function saveSession(session: SavedSession, storage = defaultStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ token: session.token, code: session.code }));
  } catch {
    // quota or blocked storage: the session just won't survive a reload
  }
}

export function clearSession(storage = defaultStorage()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
