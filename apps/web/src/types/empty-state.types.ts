/**
 * Props of the shared EmptyState and ScrollArea.
 *
 * Why: every screen shows "nothing here yet" and every box can overflow; both are asked for
 *   the same way everywhere, so the option bags are named once and call sites stay one-liners.
 *
 * Exports: EmptyStateProps, EmptyStateVariant, ScrollAreaProps.
 * Depends on: react, lucide-react. Types only.
 */

import type { LucideIcon } from 'lucide-react';
import type { HTMLAttributes, ReactNode, Ref } from 'react';

/** `page` fills the content area; `compact` sits inside a column, panel or drawer. */
export type EmptyStateVariant = 'page' | 'compact';

export interface EmptyStateProps {
  readonly title: string;
  /** The one help line: what will appear here, or what to do next. */
  readonly children?: ReactNode;
  readonly icon?: LucideIcon;
  /** Primary and secondary actions, rendered in a row under the help line. */
  readonly actions?: ReactNode;
  readonly variant?: EmptyStateVariant;
  /** `1` when the block is the page's only heading (a 404); default follows the variant. */
  readonly headingLevel?: 1 | 2;
  readonly className?: string;
}

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  /** Axis that scrolls; the other stays clipped. Default `vertical`. */
  readonly orientation?: 'vertical' | 'horizontal' | 'both';
  /** The scroll element itself, for virtualizers and scroll restoration. */
  readonly ref?: Ref<HTMLDivElement>;
}
