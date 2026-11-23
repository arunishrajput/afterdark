/**
 * Wraps the match timer on a disguised imposter's phone: a long press (or a right click on a
 * desktop) opens the real imposter controls. Nothing on the screen says it is pressable, so a glance
 * from another player sees an ordinary crew timer (UI_UX §2 › Camouflaged imposter).
 */
import { type ReactNode, useRef } from 'react';

const HOLD_MS = 600;

export function LongPress({ onLong, children }: { onLong: () => void; children: ReactNode }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };
  return (
    <div
      data-testid="timer-hold"
      className="touch-manipulation select-none"
      onPointerDown={() => {
        clear();
        timer.current = setTimeout(onLong, HOLD_MS);
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={(e) => {
        e.preventDefault();
        onLong();
      }}
    >
      {children}
    </div>
  );
}
