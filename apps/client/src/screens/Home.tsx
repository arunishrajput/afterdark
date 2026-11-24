import { DEFAULT_CONFIG, lobbyCodeSchema } from '@afterdark/shared';
import { type FormEvent, useState } from 'react';

import { NightScene } from '../components/home/NightScene';
import { HowToArt } from '../components/howto/HowToArt';
import { HowToPlay } from '../components/howto/HowToPlay';
import type { ArtId } from '../components/howto/howToPlayContent';
import { PRESETS } from '../components/lobby/settingsFields';
import { InstallCard } from '../components/pwa/InstallCard';
import { Button } from '../components/ui/Button';
import { ConnectionPill } from '../components/ui/ConnectionPill';
import { VersionTag } from '../components/ui/VersionTag';

export type Entry = { mode: 'create' } | { mode: 'join'; code: string };

const minutes = PRESETS.map((p) => p.values.playTimeMin);

/** The game at a glance, read from the config and the host's presets so it never goes stale. */
const FACTS = [
  `${DEFAULT_CONFIG.minPlayers}–${DEFAULT_CONFIG.maxPlayers} players`,
  `${Math.min(...minutes)}–${Math.max(...minutes)} min`,
  'outdoors',
].join(' · ');

/** One round in three beats, below the fold. The full rules are in How to play. */
const BEATS: readonly { art: ArtId; title: string; text: string }[] = [
  {
    art: 'tasks',
    title: 'Walk to tasks',
    text: 'Each card points to a part of the map. Walk there, find the exact spot, and solve a quick minigame.',
  },
  {
    art: 'infection',
    title: 'Imposters infect quietly',
    text: 'Staying close to someone for a few seconds is enough. Nothing shows at the time.',
  },
  {
    art: 'meetings',
    title: 'Meet and vote',
    text: 'Anyone can call a meeting. Gather at the Base, talk it out face to face, then vote on your phone.',
  },
];

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
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-10">
      <section
        aria-labelledby="home-title"
        className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] lg:items-center lg:gap-12 lg:py-10"
      >
        <div className="-mx-4 flex animate-scene-in justify-center pt-[env(safe-area-inset-top)] sm:-mx-6 lg:order-2 lg:mx-0 lg:pt-0">
          <NightScene className="aspect-[5/4] max-h-[40dvh] w-full max-w-2xl lg:max-h-none lg:max-w-none" />
        </div>

        <div className="relative mx-auto -mt-12 flex w-full max-w-md flex-1 flex-col lg:mx-0 lg:mt-0 lg:max-w-none lg:flex-none">
          <h1
            id="home-title"
            className="font-display text-[clamp(3.5rem,20vw,5.5rem)] leading-[0.9] font-bold tracking-[-0.045em] lg:text-[6.5rem]"
          >
            <span>After</span>
            <span className="text-muted">Dark</span>
          </h1>
          <p className="mt-3 font-display text-xl font-medium lg:mt-5 lg:text-2xl">
            Among Us, played on your feet.
          </p>
          <p className="mt-2 text-muted lg:text-lg">
            Walk to hidden tasks around your neighbourhood while an Imposter quietly infects the
            crew. Then meet face to face and vote.
          </p>
          <p className="mt-4 font-mono text-xs tracking-[0.14em] text-muted uppercase">{FACTS}</p>

          <div className="mt-6 flex flex-col gap-3 lg:mt-8">
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
                name="code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                className="min-h-12 w-0 flex-1 rounded-xl border border-white/15 bg-surface px-4 text-center font-mono text-xl tracking-[0.3em] uppercase transition-colors placeholder:text-muted/60 focus:border-accent focus:outline-none"
              />
              <Button type="submit" variant="secondary" disabled={!parsed.success}>
                Join game
              </Button>
            </form>

            <InstallCard />
          </div>

          <div className="mt-auto flex items-center justify-between pt-4 lg:mt-6">
            <Button variant="ghost" className="-ml-2" onClick={() => setHowTo(true)}>
              How to play
            </Button>
            <ConnectionPill />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="home-how"
        className="mx-auto w-full max-w-md border-t border-white/10 pt-12 pb-10 sm:max-w-none lg:pt-16"
      >
        <div className="lg:flex lg:items-end lg:justify-between lg:gap-12">
          <h2 id="home-how" className="font-display text-2xl font-bold lg:text-3xl">
            How a game goes
          </h2>
          <p className="mt-2 max-w-xl text-muted">
            Crew win by finishing tasks as a team or by voting out every Imposter. Imposters win by
            compromising enough of the crew.
          </p>
        </div>

        <ul className="mt-8 grid gap-4 sm:grid-cols-3 lg:gap-6">
          {BEATS.map((b) => (
            <li
              key={b.art}
              className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-surface/50 p-3"
            >
              <HowToArt id={b.art} />
              <div className="px-1 pb-1">
                <h3 className="font-display text-lg font-bold">{b.title}</h3>
                <p className="mt-1 text-sm text-muted">{b.text}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <strong className="font-display">Walk, never run.</strong>{' '}
            <span className="text-muted">
              Nothing in the game needs speed. Stop somewhere safe before you look at a task.
            </span>
          </p>
          <Button variant="secondary" className="shrink-0" onClick={() => setHowTo(true)}>
            Read the full rules
          </Button>
        </div>
      </section>

      <footer className="flex justify-center">
        <VersionTag />
      </footer>

      <HowToPlay open={howTo} onClose={() => setHowTo(false)} />
    </main>
  );
}
