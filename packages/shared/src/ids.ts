/**
 * Cryptographically random identifiers (Web Crypto, available in Node 24+ and
 * every browser). IDs are URL-safe, 12+ characters and never sequential
 * (PROTOCOL.md › Conventions).
 */

export const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const MIN_ID_LENGTH = 12;
const DEFAULT_ID_LENGTH = 16;
const MAX_ALPHABET = 256;

/**
 * A random string over `alphabet`, without modulo bias: bytes at or above the
 * largest multiple of the alphabet size are discarded and redrawn.
 */
export function randomString(length: number, alphabet: string): string {
  const size = alphabet.length;
  if (size === 0 || size > MAX_ALPHABET) {
    throw new RangeError(`alphabet must have 1–${MAX_ALPHABET} symbols`);
  }
  const limit = MAX_ALPHABET - (MAX_ALPHABET % size);
  let out = '';
  const buf = new Uint8Array(Math.max(16, length * 2));
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte >= limit) continue;
      out += alphabet[byte % size];
      if (out.length === length) break;
    }
  }
  return out;
}

/** A random URL-safe ID (default 16 characters, minimum 12). */
export function randomId(length: number = DEFAULT_ID_LENGTH): string {
  if (length < MIN_ID_LENGTH) throw new RangeError(`IDs need at least ${MIN_ID_LENGTH} chars`);
  return randomString(length, ID_ALPHABET);
}
