/**
 * BoardPage: the project's Board, Cards or Tickets view.
 *
 * Why: the Board is where a user sees all the project's work and what needs them. Cards (the
 *   requests the user and the Director talk about) are the default view; Tickets (what Workers
 *   build) is one click away, and the choice is remembered. The Ask the Director box is common
 *   to both, since a request starts as a card either way. Each view owns its own loading,
 *   empty and error states, so only the visible view polls the server.
 *
 * Exports: BoardPage.
 * Depends on: react, react-router, api/use-projects, state/board-prefs, routes/board/*.
 */

import { useEffect } from 'react';
import { useParams } from 'react-router';
import { useProjects } from '#/api/use-projects.js';
import { AskDirector } from '#/routes/board/ask-director.js';
import { BoardViewSwitch } from '#/routes/board/board-view-switch.js';
import { CardsBoard } from '#/routes/board/cards-board.js';
import { TicketsBoard } from '#/routes/board/tickets-board.js';
import { useBoardPrefs } from '#/state/board-prefs.js';

export function BoardPage() {
  const { slug = '' } = useParams();
  const projects = useProjects();
  const { view } = useBoardPrefs();
  const project = projects.data?.find((p) => p.slug === slug);

  useEffect(() => {
    document.title = `Board · ${slug} · Forge`;
  }, [slug]);

  return (
    <section className="grid gap-5">
      <div className="grid gap-1">
        <p className="font-data text-xs text-muted">{slug}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Board</h1>
      </div>

      {project ? <AskDirector project={project} /> : null}

      <BoardViewSwitch />

      {view === 'cards' ? <CardsBoard slug={slug} /> : <TicketsBoard slug={slug} />}
    </section>
  );
}
