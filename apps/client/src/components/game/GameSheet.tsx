/**
 * The game's bottom sheet (UI_UX §2, ADR-103): it floats over the full-screen map. Tap or swipe the
 * handle to collapse it to the essentials and see more of the map, and again to bring everything back.
 */
import { type ReactNode, useRef } from 'react';

/** A drag on the handle this long (px) counts as a swipe, not a tap. */
const SWIPE_PX = 24;

export function GameSheet({
  label,
  expanded,
  onExpandedChange,
  hint,
  children,
}: {
  /** What the sheet holds, for screen readers. */
  label: string;
  expanded: boolean;
  /** Without it the sheet has no handle (a fixed bar, e.g. while placing a fake task). */
  onExpandedChange?: ((expanded: boolean) => void) | undefined;
  /** Shown beside the handle while collapsed, e.g. "Show all 3 tasks". */
  hint?: string | undefined;
  children: ReactNode;
}) {
  const startY = useRef<number | undefined>(undefined);
  const swiped = useRef(false);
  return (
    <section
      aria-label={label}
      data-testid="game-sheet"
      data-expanded={expanded}
      className="rounded-t-3xl border border-b-0 border-white/10 bg-surface/95 shadow-[0_-8px_32px_rgb(0_0_0/0.45)] backdrop-blur-md"
    >
      {onExpandedChange ? (
        <button
          type="button"
          data-testid="sheet-toggle"
          aria-expanded={expanded}
          aria-label={
            expanded ? 'Collapse the panel to see more map' : (hint ?? 'Expand the panel')
          }
          onPointerDown={(e) => {
            startY.current = e.clientY;
            swiped.current = false;
          }}
          onPointerUp={(e) => {
            const from = startY.current;
            startY.current = undefined;
            if (from === undefined || Math.abs(e.clientY - from) < SWIPE_PX) return;
            swiped.current = true;
            onExpandedChange(e.clientY < from);
          }}
          onPointerCancel={() => {
            startY.current = undefined;
          }}
          onClick={() => {
            // A swipe already decided; its trailing click must not undo it.
            if (swiped.current) swiped.current = false;
            else onExpandedChange(!expanded);
          }}
          className="flex min-h-9 w-full touch-none flex-col items-center justify-center gap-1 pt-2 pb-1"
        >
          <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-white/25" />
          {!expanded && hint && (
            <span aria-hidden="true" className="text-xs font-semibold text-muted">
              {hint} ⌃
            </span>
          )}
        </button>
      ) : (
        <div className="h-3" />
      )}
      <div className="flex max-h-[min(58dvh,34rem)] flex-col gap-2 overflow-y-auto overscroll-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </section>
  );
}
