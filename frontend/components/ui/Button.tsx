'use client';

import { cn } from '@/lib/utils';
import React from 'react';

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

/**
 * Premium button primitive.
 * - Tactile micro-interaction (translate-y / scale on :active) → physical press.
 * - Focus-visible ring tied to design tokens, never bright defaults.
 * - Sizes calibrated for Fitts: lg ≥ 44px target on touch.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const base =
      'tactile inline-flex items-center justify-center gap-2 font-medium ' +
      'rounded-lg select-none whitespace-nowrap ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
      'focus-visible:ring-[var(--accent-ring)] focus-visible:ring-offset-[var(--background)] ' +
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

    const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
      primary:
        'bg-[var(--accent)] text-white shadow-[0_1px_2px_rgba(9,9,11,0.06),inset_0_1px_0_rgba(255,255,255,0.18)] ' +
        'hover:bg-[var(--accent-hover)]',
      secondary:
        'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 ' +
        'dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700',
      outline:
        'border border-zinc-300 text-zinc-800 bg-white hover:bg-zinc-50 hover:border-zinc-400 ' +
        'dark:border-zinc-700 dark:text-zinc-100 dark:bg-transparent dark:hover:bg-zinc-900/60',
      ghost:
        'text-zinc-700 hover:bg-zinc-100 ' +
        'dark:text-zinc-300 dark:hover:bg-zinc-900/60',
      danger:
        'bg-[#b91c1c] text-white hover:bg-[#991b1b] ' +
        'shadow-[0_1px_2px_rgba(9,9,11,0.06),inset_0_1px_0_rgba(255,255,255,0.18)]',
    };

    const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
      sm: 'h-8 px-3 text-xs tracking-tight',
      md: 'h-10 px-4 text-sm tracking-tight',
      lg: 'h-12 px-6 text-base tracking-tight',
    };

    return (
      <button
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        ref={ref}
        {...props}
      >
        {isLoading ? (
          <>
            <Spinner />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';

const Spinner = () => (
  <svg
    className="h-4 w-4 animate-[spin_0.7s_linear_infinite]"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden
  >
    <circle
      cx="12"
      cy="12"
      r="9"
      stroke="currentColor"
      strokeOpacity="0.25"
      strokeWidth="2.5"
    />
    <path
      d="M21 12a9 9 0 0 0-9-9"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

export default Button;
