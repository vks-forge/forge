/**
 * WorkHeader: the one-row header shared by the Card and Ticket pages.
 *
 * Why: the header used to take two to three rows (links, chips, controls, a two-line title)
 *   before the chat began, and on a phone it ate the screen. One row of about 48 px holds what
 *   the owner needs on arrival: the way back, the id, the title (it truncates; the full text is
 *   in the tooltip and the page's Details), one status pill, the cost and the `⋯` menu. On a
 *   phone the back link is its arrow and the cost drops out so the row never wraps; below 1024 px
 *   a button opens the Plan and details sheet.
 *
 * Exports: WorkHeader.
 * Depends on: react, react-router, lucide-react, components/ui/tooltip.
 */

import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Tooltip } from '#/components/ui/tooltip.js';

export function WorkHeader(props: {
  backTo: string;
  backLabel: string;
  id: string;
  title: string;
  status: ReactNode;
  cost?: ReactNode;
  /** Opens the side panels as a sheet (screens under 1024 px). */
  context?: ReactNode;
  menu?: ReactNode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 text-sm sm:gap-3">
      <Link
        to={props.backTo}
        aria-label={props.backLabel}
        className="inline-flex size-9 shrink-0 items-center justify-center gap-1 rounded-lg text-muted hover:bg-hover hover:text-fg sm:w-auto sm:px-2"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        <span className="hidden sm:inline">{props.backLabel}</span>
      </Link>
      <span className="shrink-0 font-data text-muted">{props.id}</span>
      <Tooltip content={props.title}>
        <h1
          tabIndex={0}
          className="min-w-0 flex-1 truncate rounded-sm text-base font-semibold tracking-tight"
        >
          {props.title}
        </h1>
      </Tooltip>
      {props.status}
      {props.cost === undefined ? null : (
        <span className="hidden shrink-0 sm:inline-flex">{props.cost}</span>
      )}
      {props.context}
      {props.menu}
    </header>
  );
}
