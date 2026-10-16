/**
 * InProgress: the tickets that have started and are not finished, each with a stage track.
 *
 * Why: after "what waits on me" the next question is "what is moving?". Each ticket shows its
 *   id (a link to its page), title and a track of five stages, and a "Needs you" mark when the
 *   server says it waits on a person. Newest change first, the first eight shown, with the
 *   true total and a link to the Board for the rest. The ticket list is the Board's own query,
 *   so Home and Board never disagree.
 *
 * Exports: InProgress, IN_PROGRESS_SHOWN.
 * Depends on: react-router, api/use-tickets, components/ticket/ticket-link, domain/ticket-stage.
 */

import { Link } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useTicketBoard } from '#/api/use-tickets.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { projectPath } from '#/domain/nav-entries.js';
import { IN_PROGRESS_STATUSES, stageOf } from '#/domain/ticket-stage.js';
import { StageTrack } from '#/routes/home/stage-track.js';

export const IN_PROGRESS_SHOWN = 8;

export function InProgress(props: { slug: string }) {
  const { query, tickets } = useTicketBoard(props.slug);
  const active = tickets.filter((t) => IN_PROGRESS_STATUSES.includes(t.state));

  return (
    <section aria-labelledby="home-progress" className="grid content-start gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="home-progress" className="text-base font-semibold">
          In progress
        </h2>
        <Link
          to={projectPath(props.slug, 'board')}
          className="text-sm font-medium text-signal underline-offset-2 hover:underline"
        >
          Open Board
        </Link>
      </div>

      {query.isPending ? (
        <StatePanel kind="loading" label="Loading tickets" />
      ) : query.isError ? (
        <StatePanel
          kind="error"
          title={describeError(query.error).title}
          detail={describeError(query.error).detail}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : active.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          No ticket is in progress. Create a card to start something.
        </p>
      ) : (
        <>
          <ul
            aria-label="In progress"
            className="grid rounded-xl border border-line bg-surface px-3"
          >
            {active.slice(0, IN_PROGRESS_SHOWN).map((ticket) => (
              <li
                key={ticket.id}
                className="grid gap-1.5 border-b border-line py-2.5 last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <TicketLink
                    id={ticket.id}
                    slug={props.slug}
                    className="shrink-0 text-xs"
                  />
                  <span className="min-w-0 flex-1 truncate">{ticket.title}</span>
                  {ticket.needs_you ? (
                    <span className="shrink-0 rounded-md bg-attn-soft px-1.5 py-0.5 text-xs font-medium">
                      Needs you
                    </span>
                  ) : null}
                </div>
                <StageTrack stage={stageOf(ticket.state)} needsYou={ticket.needs_you} />
              </li>
            ))}
          </ul>
          {active.length > IN_PROGRESS_SHOWN ? (
            <p className="text-xs text-muted">
              Showing {IN_PROGRESS_SHOWN} of {active.length}.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
