import { HOW_TO_SEEN_KEY } from './howToPlayContent';

/** Has this device been shown the How to play hint? (A per-device convenience; blocked storage means "no".) */
export function howToSeen(): boolean {
  try {
    return globalThis.localStorage?.getItem(HOW_TO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markHowToSeen(): void {
  try {
    globalThis.localStorage?.setItem(HOW_TO_SEEN_KEY, '1');
  } catch {
    // blocked storage: the hint shows again next visit
  }
}
