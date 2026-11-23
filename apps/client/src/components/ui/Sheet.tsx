import { type ReactNode, useEffect, useRef } from 'react';

/** A bottom sheet built on <dialog> (focus trap, Esc to close, inert background). */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 text-text backdrop:bg-black/70 sm:mx-auto sm:max-w-md"
    >
      <div className="max-h-[88dvh] overflow-y-auto rounded-t-3xl border border-white/10 bg-surface px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <div aria-hidden="true" className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <h2 className="mb-4 font-display text-xl font-bold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
