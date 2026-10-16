/**
 * BoardEmpty: the Board of a project that has no cards or tickets yet.
 *
 * Why: a brand-new project opens on a Board with nothing on it, and a blank page there reads
 *   as broken. This shows the columns the work will move through (their real names and
 *   meanings, no invented items), so the user sees the shape of the Board, and says plainly how
 *   to start: tell the Director what you want. The button moves focus to the Ask the Director
 *   box, so the way in is one click or one Tab away.
 *
 * Exports: BoardEmpty.
 * Depends on: react, lucide-react, routes/board/ask-director, routes/board/column-shell,
 *   routes/board/archived-reason, state/project-archived, components/ui/{button,tooltip},
 *   types/board.types.
 */

import { MessageSquarePlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '#/components/ui/button.js';
import { Tooltip } from '#/components/ui/tooltip.js';
import { focusComposer } from '#/routes/board/ask-director.js';
import { ARCHIVED_REASON } from '#/routes/board/archived-reason.js';
import { TONE_DOT } from '#/routes/board/column-shell.js';
import { useProjectArchived } from '#/state/project-archived.js';
import type { ColumnTone } from '#/types/board.types.js';

export function BoardEmpty(props: {
  title: string;
  children: ReactNode;
  columns: readonly { id: string; title: string; hint: string; tone: ColumnTone }[];
}) {
  const archived = useProjectArchived();

  return (
    <div role="status" className="grid gap-4">
      <div className="grid justify-items-start gap-3 rounded-2xl border border-line bg-surface p-6 md:p-8">
        <span
          aria-hidden="true"
          className="grid size-10 place-items-center rounded-xl bg-signal-soft text-signal"
        >
          <MessageSquarePlus className="size-5" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">{props.title}</h2>
        <p className="max-w-prose text-sm text-muted">{props.children}</p>
        <Tooltip content={ARCHIVED_REASON} disabled={!archived}>
          <span className="inline-flex">
            <Button variant="primary" onClick={focusComposer} disabled={archived}>
              Write a request
            </Button>
          </span>
        </Tooltip>
        {archived ? <p className="text-xs text-muted">{ARCHIVED_REASON}</p> : null}
      </div>
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
