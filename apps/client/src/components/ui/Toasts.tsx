import { useEffect } from 'react';

import { type Toast, useGame } from '../../store';

const TOAST_MS = 3500;

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useGame((s) => s.dismissToast);
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast.id, dismiss]);
  return (
    <li className="animate-toast-in rounded-xl border border-white/10 bg-surface/95 px-4 py-3 text-sm shadow-lg backdrop-blur">
      {toast.text}
    </li>
  );
}

/** Polite live region above the bottom bar. */
export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <ol
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(7rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </ol>
  );
}
