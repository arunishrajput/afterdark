import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'px-5 bg-accent text-bg shadow-[0_0_24px_var(--accent-glow)] hover:brightness-110',
  secondary: 'px-5 border border-white/15 bg-surface text-text hover:border-white/30',
  ghost: 'px-2 text-muted hover:text-text',
  danger: 'px-5 border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-xl font-semibold transition duration-150 select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
