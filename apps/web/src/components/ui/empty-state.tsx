/**
 * EmptyState: the one "nothing here" block, centred in the space it fills.
 *
 * Why: a list, board, page or panel with no rows must say what it will hold and what to do,
 *   and must look the same on every screen so users recognise it at a glance. A bordered
 *   card floating at the top left read as an error; this sits centred in the content area with
 *   a quiet icon, a title, one help line and optional actions (Director, Worker or owner
 *   action alike). `compact` is the same block scaled down for columns, drawers and panels.
 *
 * Exports: EmptyState.
 * Depends on: react, lucide-react, types/empty-state.types.
 */

import { Inbox } from 'lucide-react';
import type { EmptyStateProps } from '#/types/empty-state.types.js';

export function EmptyState(props: EmptyStateProps) {
  const { title, children, actions, variant = 'page', className = '' } = props;
  const Icon = props.icon ?? Inbox;
  const compact = variant === 'compact';
  const Heading = compact ? 'h3' : 'h2';

  return (
    <div
      role="status"
      data-variant={variant}
      className={`grid w-full place-content-center justify-items-center text-center ${
        compact ? 'gap-2 px-3 py-6' : 'min-h-[min(60vh,26rem)] gap-3 px-4 py-14'
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`grid place-items-center rounded-full bg-hover text-faint ring-1 ring-line ${
          compact ? 'size-9' : 'size-14'
        }`}
      >
        <Icon className={compact ? 'size-4' : 'size-6'} strokeWidth={1.5} />
      </span>
      <Heading
        className={`font-semibold tracking-tight ${compact ? 'text-sm' : 'text-base'}`}
      >
        {title}
      </Heading>
      {children ? (
        <div className={`max-w-sm text-muted ${compact ? 'text-xs' : 'text-sm'}`}>
          {children}
        </div>
      ) : null}
      {actions ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
