import { lobbyCodeSchema } from '@afterdark/shared';
import { type FormEvent, useState } from 'react';

import { HowToPlay } from '../components/howto/HowToPlay';
import { InstallCard } from '../components/pwa/InstallCard';
import { Button } from '../components/ui/Button';
import { ConnectionPill } from '../components/ui/ConnectionPill';
import { VersionTag } from '../components/ui/VersionTag';

export type Entry = { mode: 'create' } | { mode: 'join'; code: string };

export function Home({
  initialCode,
  onEnter,
}: {
  initialCode: string;
  onEnter: (e: Entry) => void;
}) {
  const [code, setCode] = useState(initialCode);
  const [howTo, setHowTo] = useState(false);
  const parsed = lobbyCodeSchema.safeParse(code);

  const submitJoin = (e: FormEvent) => {
    e.preventDefault();
    if (parsed.success) onEnter({ mode: 'join', code: parsed.data });
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h1 className="font-display text-6xl font-bold tracking-tight drop-shadow-[0_0_24px_var(--accent-glow)]">
          AfterDark
        </h1>
        <p className="text-muted">Among Us, played on your feet.</p>
      </header>

      <div className="flex flex-col gap-4">
        <Button onClick={() => onEnter({ mode: 'create' })} className="w-full text-lg">
          Create game
        </Button>

        <form onSubmit={submitJoin} className="flex gap-2" aria-label="Join a game">
          <label className="sr-only" htmlFor="join-code">
            Lobby code
          </label>
          <input
            id="join-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
            placeholder="CODE"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            className="min-h-12 w-0 flex-1 rounded-xl border border-white/15 bg-surface px-4 text-center font-mono text-xl tracking-[0.3em] uppercase placeholder:text-muted/60 focus:border-accent focus:outline-none"
          />
          <Button type="submit" variant="secondary" disabled={!parsed.success}>
            Join game
          </Button>
        </form>

        <InstallCard />

        <div className="mt-2 flex items-center justify-between">
          <Button variant="ghost" className="-ml-2" onClick={() => setHowTo(true)}>
            How to play
          </Button>
          <ConnectionPill />
        </div>
        <VersionTag className="text-center" />
      </div>

      <HowToPlay open={howTo} onClose={() => setHowTo(false)} />
    </main>
  );
}
