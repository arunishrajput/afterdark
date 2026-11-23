/**
 * Camouflage on the imposter's own screen (RULES §7.4, UI_UX §2): while the server says
 * the disguise is on, the phone is a crew phone: blue theme, decoy cards among the real
 * ones. Pure helpers so the screens and the tests agree on when that is.
 */
import type { CamouflageView, PlayerView, TaskCard } from '@afterdark/shared';

/** The disguise, only while it is still on at server time `now` (the next view drops it, this just snaps the theme on time). */
export function disguiseOf(view: PlayerView | undefined, now: number): CamouflageView | undefined {
  const c = view?.me.imposter?.camouflage;
  return c && c.until > now ? c : undefined;
}

/** The cards a phone shows: a disguised imposter's decoys first, then the real ones (their partner card, if they hold one). */
export function cardsFor(view: PlayerView, disguise: CamouflageView | undefined): TaskCard[] {
  return [...(disguise?.decoyTasks ?? []), ...(view.game?.tasks ?? [])];
}

/** The theme of a normal game screen: a disguised imposter wears crew blue. */
export function playTheme(view: PlayerView, now: number): 'crew' | 'imposter' {
  if (view.me.role === 'crew') return 'crew';
  return disguiseOf(view, now) ? 'crew' : 'imposter';
}

/** Fraction of the disguise left, for the thin top-edge line (1 at the start, 0 at the end). */
export function disguiseFraction(
  disguise: CamouflageView,
  now: number,
  durationMs: number,
): number {
  return Math.max(0, Math.min(1, (disguise.until - now) / durationMs));
}
