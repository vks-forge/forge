/**
 * Props of the shared Tooltip.
 *
 * Why: icon-only buttons need a visible name on hover and keyboard focus, and every screen
 *   asks for it the same way. Naming the option bag once keeps each call site to a single
 *   `content` prop and keeps the placement choices to the few that make sense.
 *
 * Exports: TooltipProps.
 * Depends on: react. Types only.
 */

import type { ReactElement, ReactNode } from 'react';

export interface TooltipProps {
  /** The words shown. Supplements the trigger's `aria-label`, never replaces it. */
  readonly content: ReactNode;
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
  readonly align?: 'start' | 'center' | 'end';
  /** A key hint shown as a small chip after the words, e.g. "Esc". */
  readonly shortcut?: string | undefined;
  /** Turns the tooltip off without unmounting the trigger. */
  readonly disabled?: boolean | undefined;
  /** One focusable element; it receives the hover and focus handlers. */
  readonly children: ReactElement;
}
