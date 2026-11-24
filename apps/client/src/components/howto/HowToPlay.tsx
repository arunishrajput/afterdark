import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { HowToArt } from './HowToArt';
import { HOW_TO_CARDS } from './howToPlayContent';

/** The five illustrated How to play cards in a sheet. Reachable from Home and the Lobby. */
export function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} title="How to play" onClose={onClose}>
      <ol className="flex flex-col gap-4" data-testid="how-to-play">
        {HOW_TO_CARDS.map((card, i) => (
          <li
            key={card.id}
            data-testid="how-to-card"
            className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-bg/40 p-3"
          >
            <HowToArt id={card.id} />
            <div>
              <h3 className="font-display text-lg font-bold">
                <span className="mr-2 font-mono text-sm text-muted">{i + 1}/5</span>
                {card.title}
              </h3>
              {card.lines.map((line) => (
                <p key={line} className="mt-1 text-sm text-muted">
                  {line}
                </p>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <Button variant="secondary" className="mt-5 w-full" onClick={onClose}>
        Got it
      </Button>
    </Sheet>
  );
}
