/**
 * Secret tags (ROLES.md › Identities): `WORD-NN`, easy to say aloud, such as
 * `RAVEN-07`. No two players in a game share a word, so a spoken tag is never
 * ambiguous. The words are short, distinct-sounding night/ops nouns.
 */
import type { Rng } from './rng';

export const TAG_WORDS = [
  'RAVEN',
  'OWL',
  'FOX',
  'WOLF',
  'MOTH',
  'BAT',
  'LYNX',
  'CROW',
  'HAWK',
  'VIPER',
  'COBRA',
  'TIGER',
  'PANTHER',
  'FALCON',
  'BADGER',
  'OTTER',
  'HERON',
  'RAPTOR',
  'SPIDER',
  'SCORPION',
  'EMBER',
  'COMET',
  'NOVA',
  'ORBIT',
  'PULSE',
  'SIGNAL',
  'RADAR',
  'ECHO',
  'DELTA',
  'OMEGA',
  'SIGMA',
  'ZENITH',
  'NEBULA',
  'AURORA',
  'ECLIPSE',
  'MIDNIGHT',
  'SHADOW',
  'PHANTOM',
  'GHOST',
  'SPECTER',
  'LANTERN',
  'BEACON',
  'COMPASS',
  'ANCHOR',
  'ARROW',
  'DAGGER',
  'COBALT',
  'ONYX',
  'JADE',
  'AMBER',
] as const;

const TAG_NUMBER_MAX = 99;
const TAG_NUMBER_DIGITS = 2;

/** `RAVEN-07`: the word and a two-digit number from 01 to 99. */
export function formatTag(word: string, no: number): string {
  return `${word}-${String(no).padStart(TAG_NUMBER_DIGITS, '0')}`;
}

/** `count` tags with distinct words (throws if there are fewer words than players). */
export function drawTags(rng: Rng, count: number): string[] {
  if (count > TAG_WORDS.length) throw new RangeError('Not enough tag words');
  return rng.shuffle(TAG_WORDS).slice(0, count).map((w) => formatTag(w, rng.int(1, TAG_NUMBER_MAX)));
}

/** The shape every tag has. */
export const TAG_PATTERN = /^[A-Z]+-\d{2}$/;
