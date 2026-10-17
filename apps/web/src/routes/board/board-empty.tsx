/**
 * BoardEmpty: the Board of a project that has no cards or tickets yet.
 *
 * Why: a brand-new project opens on a Board with nothing on it, and a blank page there reads
 *   as broken. This shows the columns the work will move through (their real names and
 *   meanings, no invented items), so the user sees the shape of the Board, and says plainly how
 *   to start: create a card for the Director. The button opens the New card popup, so the way
 *   in is one click or one Tab away.
 *
 * Exports: BoardEmpty.
 * Depends on: react, lucide-react, components/cards/new-card-button, routes/board/column-shell,
 *   state/project-archived, types/board.types.
 */

import { MessageSquarePlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { NewCardButton } from '#/components/cards/new-card-button.js';
import { EmptyState } from '#/components/ui/empty-state.js';
import { ARCHIVED_REASON } from '#/routes/board/archived-reason.js';
import { TONE_DOT } from '#/routes/board/column-shell.js';
import { useProjectArchived } from '#/state/project-archived.js';
import type { ColumnTone } from '#/types/board.types.js';

export function BoardEmpty(props: {
  slug: string;
  title: string;
  children: ReactNode;
  columns: readonly { id: string; title: string; hint: string; tone: ColumnTone }[];
}) {
  const archived = useProjectArchived();

  return (
    <div className="grid gap-4">
      <EmptyState
        icon={MessageSquarePlus}
        title={props.title}
        actions={
          <NewCardButton
            slug={props.slug}
            variant="primary"
            label="Create your first card"
          />
        }
      >
        {props.children}
        {archived ? <span className="mt-2 block text-xs">{ARCHIVED_REASON}</span> : null}
      </EmptyState>
      <ul
        aria-label="Where work will appear"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
      >
        {props.columns.map((column) => (
          <li
            key={column.id}
            className="grid content-start gap-1 rounded-xl border border-dashed border-line p-3"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-muted">
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${TONE_DOT[column.tone]}`}
              />
              {column.title}
            </span>
            <span className="pl-4 text-xs text-faint">{column.hint}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
