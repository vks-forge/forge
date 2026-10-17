/**
 * TicketHeader: who this ticket is, where it stands and what it has cost, always visible above
 *   the tabs.
 *
 * Why: the first things a person needs on arrival are the id, the title, the state and, when
 *   the ticket is not moving, why. The header gives those, then the facts that explain them:
 *   lane and tier (how much care it gets), the cost so far (one small muted figure, a dash when
 *   no run recorded one), rework count, the pull request when there is one, the scheduler's
 *   wait reason ("quota: claude-code until 14:20 UTC") and any tickets it waits on, each a link
 *   (d-0116), and the card it came from, so the conversation behind it is one click away. Every
 *   fact is text; nothing is only a colour. The full metadata and the per-run cost live in the
 *   Details tab.
 *
 * Exports: TicketHeader.
 * Depends on: react, react-router, lucide-react, components/cost/cost-chip, components/ticket/*,
 *   domain/nav-entries, schemas/tickets (type).
 */

import { ArrowLeft, ExternalLink, GitPullRequest, RotateCcw } from 'lucide-react';
import { Link } from 'react-router';
import { CostChip } from '#/components/cost/cost-chip.js';
import { LaneChip, StateChip } from '#/components/ticket/status-chips.js';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { cardPath } from '#/domain/card-paths.js';
import { projectPath } from '#/domain/nav-entries.js';
import type { TicketDetail } from '#/schemas/tickets.js';

export function TicketHeader(props: { slug: string; detail: TicketDetail }) {
  const { ticket, wait_reason: waitReason } = props.detail;

  return (
    <header className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          to={projectPath(props.slug, 'board')}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Board
        </Link>
        <span className="font-data text-sm text-muted">{ticket.id}</span>
        <StateChip state={ticket.status} />
        <LaneChip lane={ticket.lane} />
        <span className="font-data text-xs text-muted">
          {ticket.type} · tier {ticket.tier_actual ?? ticket.tier_predicted}
        </span>
        <CostChip
          usd={props.detail.cost?.total_usd}
          recorded={props.detail.cost?.by_run.some((run) => run.recorded) ?? false}
          label="Cost of this ticket"
          className="ml-auto"
        />
      </div>
      <h1 className="line-clamp-2 text-xl font-semibold tracking-tight">
        {ticket.title}
      </h1>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        {ticket.pr_url ? (
          <a
            href={ticket.pr_url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 font-medium text-signal hover:underline"
          >
            <GitPullRequest aria-hidden="true" className="size-4" />
            Pull request{ticket.pr_number ? ` #${ticket.pr_number}` : ''}
            <ExternalLink aria-hidden="true" className="size-3.5" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : null}
        {ticket.rework_count > 0 ? (
          <span className="inline-flex items-center gap-1">
            <RotateCcw aria-hidden="true" className="size-4" />
            Reworked {ticket.rework_count}×
          </span>
        ) : null}
        {ticket.blocked_by.length > 0 ? (
          <span>
            Waiting on{' '}
            {ticket.blocked_by.map((id, index) => (
              <span key={id}>
                {index > 0 ? ', ' : ''}
                <TicketLink id={id} slug={props.slug} />
              </span>
            ))}
          </span>
        ) : null}
        {ticket.card_id ? (
          <span>
            From card{' '}
            <Link
              to={cardPath(props.slug, ticket.card_id)}
              className="rounded-sm font-medium text-signal underline-offset-2 hover:underline"
            >
              <span className="font-data">{ticket.card_id}</span>
            </Link>
          </span>
        ) : null}
        {ticket.parent ? (
          <span>
            Part of <TicketLink id={ticket.parent} slug={props.slug} />
          </span>
        ) : null}
      </div>
      {ticket.blocked_reason ? <p className="text-sm">{ticket.blocked_reason}</p> : null}
      {waitReason ? (
        <p className="text-sm text-muted">
          Not started: <span className="font-data">{waitReason}</span>
        </p>
      ) : null}
    </header>
  );
}
