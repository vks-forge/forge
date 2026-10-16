/**
 * BoardPage: the project's Board, Cards or Tickets view.
 *
 * Why: the Board is where a user sees all the project's work and what needs them. Cards (the
 *   requests the user and the Director talk about) are the default view; Tickets (what Workers
 *   build) is one click away, and the choice is remembered. The header (title, view switch,
 *   New request) and the Ask the Director box are common to both, since a request starts as a
 *   card either way. Each view owns its own loading, empty and error states, so only the
 *   visible view polls the server.
 *
 * Exports: BoardPage.
 * Depends on: react, react-router, api/use-projects, state/board-prefs, routes/board/*.
 */

import { useEffect } from 'react';
import { useParams } from 'react-router';
import { useProjects } from '#/api/use-projects.js';
import { AskDirector } from '#/routes/board/ask-director.js';
import { BoardHeader } from '#/routes/board/board-header.js';
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
    <section className="grid gap-6 pb-12">
      <BoardHeader
        slug={slug}
        view={view}
        canCompose={project !== undefined && project.status !== 'archived'}
      />

      {project ? <AskDirector project={project} /> : null}

      {view === 'cards' ? <CardsBoard slug={slug} /> : <TicketsBoard slug={slug} />}
    </section>
  );
}
