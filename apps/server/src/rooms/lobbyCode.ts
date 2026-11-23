/**
 * Lobby codes (RULES §3.1): `lobbyCodeLength` symbols from `lobbyCodeAlphabet`,
 * unique among live lobbies. Production draws from Web Crypto; tests inject a
 * seeded `Rng` so codes are reproducible.
 */
import { DEFAULT_CONFIG, randomString, type Rng } from '@afterdark/shared';

/** Returns `length` random symbols from `alphabet`. */
export type CodeSource = (length: number, alphabet: string) => string;

export const cryptoCodeSource: CodeSource = randomString;

export const rngCodeSource =
  (rng: Rng): CodeSource =>
  (length, alphabet) => {
    let out = '';
    for (let i = 0; i < length; i++) out += alphabet[rng.int(0, alphabet.length - 1)];
    return out;
  };

/** 32^6 ≈ 10^9 codes, so even one retry is rare; this only guards a broken source. */
const MAX_ATTEMPTS = 100;

export function generateLobbyCode(source: CodeSource, isTaken: (code: string) => boolean): string {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const code = source(DEFAULT_CONFIG.lobbyCodeLength, DEFAULT_CONFIG.lobbyCodeAlphabet);
    if (!isTaken(code)) return code;
  }
  throw new Error('Could not generate a free lobby code');
}
