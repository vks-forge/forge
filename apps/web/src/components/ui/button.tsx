/**
 * Button: the one clickable control, with every state designed.
 *
 * Why: a button that only looks right at rest teaches users to distrust it. Each state is
 *   visible and distinct: hover and press (a one-pixel sink, transform only), a focus ring that
 *   shows instantly, disabled, loading (spinner, blocks a second click while a request is in
 *   flight), error and success (icon plus colour, never colour alone). Primary is the single
 *   cobalt action on a screen; `quiet` is for everything else; `danger` is for discarding.
 *
 * Exports: Button.
 * Depends on: react, lucide-react.
 */

import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

const VARIANTS = {
  primary:
    'bg-signal text-on-signal hover:bg-signal-hi disabled:hover:bg-signal border border-transparent',
  quiet: 'bg-surface text-fg border border-line hover:bg-hover',
  danger: 'bg-danger-soft text-danger border border-transparent hover:border-danger',
} as const;

const STATUS_ICON = {
  loading: LoaderCircle,
  error: CircleAlert,
  success: Check,
} as const;

export function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: keyof typeof VARIANTS;
    /** `loading` blocks clicks and shows a spinner; `error` and `success` add an icon. */
    status?: 'idle' | 'loading' | 'error' | 'success';
    children: ReactNode;
  },
) {
  const { variant = 'quiet', status = 'idle', className = '', children, ...rest } = props;
  const Icon = status === 'idle' ? null : STATUS_ICON[status];
  const tone =
    status === 'error'
      ? 'border-danger text-danger'
      : status === 'success'
        ? 'border-good text-good'
        : '';

  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || status === 'loading'}
      aria-busy={status === 'loading' || undefined}
      className={`inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-[transform,background-color,border-color,color] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${tone} ${className}`}
    >
      {Icon ? (
        <Icon
          aria-hidden="true"
          className={`size-4 ${status === 'loading' ? 'animate-spin' : ''}`}
        />
      ) : null}
      {children}
    </button>
  );
}
