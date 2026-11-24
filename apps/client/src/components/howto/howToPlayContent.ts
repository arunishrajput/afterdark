/** The How to play cards (UI_UX §3, PHASE-13 §13.7). Plain copy; the pictures are in `HowToArt.tsx`. Never says "run". */
export type ArtId = 'goal' | 'tasks' | 'infection' | 'meetings' | 'safety';

export interface HowToCard {
  id: ArtId;
  title: string;
  lines: readonly string[];
}

export const HOW_TO_CARDS: readonly HowToCard[] = [
  {
    id: 'goal',
    title: 'The goal',
    lines: [
      'AfterDark is Among Us played on your feet. Everyone joins one lobby and plays outside, inside an area the host draws.',
      'Most of you are Crew. A few are secret Imposters. Crew win by finishing tasks as a team or by voting out every Imposter. Imposters win by compromising enough of the crew.',
    ],
  },
  {
    id: 'tasks',
    title: 'Tasks and directions',
    lines: [
      'Your task cards point to a part of the map. Walk there and stay a few seconds: the exact spot appears, and your phone buzzes.',
      'Walk to the spot, tap Start, and solve the quick minigame. Don’t like a card? Reroll it. Some tasks need a partner: find the tag on the card.',
    ],
  },
  {
    id: 'infection',
    title: 'Imposters and infection',
    lines: [
      'An Imposter infects a player by standing close to them for a few seconds. Nothing shows at the time, and the infection takes a while to settle in.',
      'The boxes at the top fill as crew get compromised. Imposters can also jam the tasks or plant fake ones, so a task that does nothing may be a trick.',
    ],
  },
  {
    id: 'meetings',
    title: 'Meetings and voting',
    lines: [
      'Anyone can call one emergency meeting. Everyone walks to the Base, then you talk face to face. There is no chat in the app: talk to each other.',
      'Then everybody votes on their phone. The player with the most votes is out and is shown as Imposter or not. Vote wrongly and a crew member is compromised.',
    ],
  },
  {
    id: 'safety',
    title: 'Safety first',
    lines: [
      'Walk. Never run. Nothing in the game needs speed.',
      'Look up before you start a task, and stop somewhere safe first. Stay out of roads, car parks in use and private property. Leave the game any time from the menu.',
    ],
  },
];

/** Where players read this once without being asked. */
export const HOW_TO_SEEN_KEY = 'afterdark.howToSeen';
