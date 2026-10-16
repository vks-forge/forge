/**
 * BoardHeader: the title block at the top of the Board.
 *
 * Why: the first screenful of the Board must say where you are (this project's Board), what
 *   the current view shows, and what you can do (switch view, start a request). It uses the
 *   same hero shape as the settings pages (icon tile, title, mono id chip, one line, actions
 *   on the same row) so the app reads as one product. The view switch lives here, above every
 *   loading, empty and error state, so the way to the other view never disappears with data.
 *
 * Exports: BoardHeader.
 * Depends on: react, lucide-react, routes/board/board-view-switch, routes/board/ask-director,
 *   routes/board/archived-reason, components/ui/{button,tooltip}, types/ui-state.types.
 */

import { LayoutDashboard, Plus } from 'lucide-react';
import { Button } from '#/components/ui/button.js';
import { Tooltip } from '#/components/ui/tooltip.js';
import { focusComposer } from '#/routes/board/ask-director.js';
import { ARCHIVED_REASON } from '#/routes/board/archived-reason.js';
import { BoardViewSwitch } from '#/routes/board/board-view-switch.js';
import type { BoardPrefs } from '#/types/ui-state.types.js';

const INTRO: Readonly<Record<BoardPrefs['view'], string>> = {
  cards:
    'The requests you and the Director are working through. Each card rolls up its tickets and questions.',
  tickets:
    'The units of work Workers build, grouped by where they are. Needs you holds everything waiting on a person.',
};

export function BoardHeader(props: {
  slug: string;
  view: BoardPrefs['view'];
  /** False while the project is unknown: there is nowhere to write. */
  canCompose: boolean;
  /** An archived project takes no new work: the button stays, disabled, with the reason. */
  archived: boolean;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-xl border border-line bg-surface text-fg"
        >
          <LayoutDashboard className="size-6" />
        </span>
        <div className="grid min-w-0 gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Board</h1>
            <span className="max-w-full truncate rounded-md bg-hover px-1.5 py-0.5 font-data text-xs text-muted">
              {props.slug}
            </span>
          </div>
          <p className="max-w-prose text-sm text-muted">{INTRO[props.view]}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <BoardViewSwitch />
        {props.canCompose ? (
          <Tooltip content={ARCHIVED_REASON} disabled={!props.archived}>
            <span className="inline-flex">
              <Button onClick={focusComposer} disabled={props.archived}>
                <Plus aria-hidden="true" className="size-4" />
                New request
              </Button>
            </span>
          </Tooltip>
        ) : null}
      </div>
    </header>
  );
}
