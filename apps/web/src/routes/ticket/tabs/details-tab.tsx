/**
 * DetailsTab: the ticket's metadata and cost, in plain labelled facts.
 *
 * Why: the header carries only what the owner needs at a glance. This tab answers the rest:
 *   which card it came from (a link), its lane and tier (how much care it gets), type, the
 *   branch and pull request, how often it was reworked, when it was made and last changed, the
 *   latest result of each gate, and where the money went (total and per run, with "not
 *   recorded" kept honest). Every fact is text; one the ticket does not have says so in words.
 *
 * Exports: DetailsTab.
 * Depends on: react, react-router, components/cost/cost-breakdown, domain/card-paths,
 *   domain/format-time, routes/ticket/ticket-side, schemas/tickets (type).
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { TicketCostBreakdown } from '#/components/cost/cost-breakdown.js';
import { cardPath } from '#/domain/card-paths.js';
import { formatWhen } from '#/domain/format-time.js';
import { GateStrip } from '#/routes/ticket/ticket-side.js';
import type { TicketDetail } from '#/schemas/tickets.js';

const LINK = 'font-medium text-signal underline-offset-2 hover:underline';

export function DetailsTab(props: { slug: string; detail: TicketDetail }) {
  const { ticket } = props.detail;
  const rows: readonly [string, ReactNode][] = [
    ['Type', ticket.type],
    ['Lane', ticket.lane],
    [
      'Tier',
      `${ticket.tier_actual ?? ticket.tier_predicted}${ticket.tier_actual === undefined ? ' (predicted)' : ''}`,
    ],
    [
      'Card',
      ticket.card_id === undefined ? (
        'None'
      ) : (
        <Link to={cardPath(props.slug, ticket.card_id)} className={LINK}>
          <span className="font-data">{ticket.card_id}</span>
        </Link>
      ),
    ],
    [
      'Branch',
      ticket.branch === undefined ? (
        'Not created yet'
      ) : (
        <span className="font-data text-xs">{ticket.branch}</span>
      ),
    ],
    [
      'Pull request',
      ticket.pr_url === undefined ? (
        'None yet'
      ) : (
        <a
          href={ticket.pr_url}
          target="_blank"
          rel="noreferrer noopener"
          className={LINK}
        >
          {ticket.pr_number === undefined ? 'Open it' : `#${ticket.pr_number}`}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ),
    ],
    ['Reworked', `${ticket.rework_count} time${ticket.rework_count === 1 ? '' : 's'}`],
    ['Created', formatWhen(ticket.created_at)],
    ['Last change', formatWhen(ticket.updated_at)],
  ];

  return (
    <div className="mx-auto grid max-w-3xl gap-8">
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-0.5 sm:contents">
            <dt className="text-muted">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <GateStrip results={props.detail.gate_results} />
      <section className="grid gap-2" aria-label="Cost">
        <h2 className="text-sm font-semibold">Cost</h2>
        <TicketCostBreakdown cost={props.detail.cost} />
      </section>
    </div>
  );
}
