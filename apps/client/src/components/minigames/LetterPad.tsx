/**
 * An on-screen A–Z keypad. The games that take letters (Mini Crossword, Signal
 * Decode) use it instead of the system keyboard, which would pop up, shift the
 * layout and cover the game. Keys are at least 44 px high.
 */
const ROWS = ['ABCDEFG', 'HIJKLMN', 'OPQRSTU', 'VWXYZ'] as const;

export function LetterPad({
  onLetter,
  onBackspace,
  disabled,
}: {
  onLetter: (letter: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
}) {
  const key =
    'min-h-11 min-w-0 flex-1 touch-manipulation rounded-lg border border-white/15 bg-surface font-mono text-lg font-bold uppercase text-text transition active:scale-95 disabled:opacity-40';
  return (
    <div
      role="group"
      aria-label="Letters"
      className="flex flex-col gap-1.5"
      data-testid="letter-pad"
    >
      {ROWS.map((row, r) => (
        <div key={row} className="flex gap-1.5">
          {[...row].map((letter) => (
            <button
              key={letter}
              type="button"
              data-testid={`key-${letter}`}
              disabled={disabled}
              className={key}
              onClick={() => onLetter(letter)}
            >
              {letter}
            </button>
          ))}
          {r === ROWS.length - 1 && (
            <button
              type="button"
              data-testid="key-backspace"
              aria-label="Delete letter"
              disabled={disabled}
              className={`${key} flex-[2]`}
              onClick={onBackspace}
            >
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
