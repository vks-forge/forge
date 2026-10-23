/**
 * DetailsTab: the ticket's metadata and cost, in plain labelled facts.
 *
 * Why: the one-row header carries only the id, title, state and cost. This tab answers the rest:
 *   which card it came from (a link), the tickets it depends on (all of them, finished or not; the header says what it still waits for) and the one it is part of, its lane and tier (how much care it gets), type, the
 *   branch and pull request, how often it was reworked, when it was made and last changed, the
 *   latest result of each gate, and where the money went (total and per run, with "not
 *   recorded" kept honest). Every fact is text; one the ticket does not have says so in words.
 *
 * The owner can edit priority, waits and (before work starts) the description here, until the ticket is done or cancelled.
 *
 * Exports: DetailsTab.
 * Depends on: react, react-router, @forge/core, api/use-tickets, components/ui/button, routes/ticket/ticket-edit-form, components/cost/cost-breakdown, domain/card-paths,
 *   domain/format-time, routes/ticket/ticket-side, schemas/tickets (type).
 */

import type { ReactNode } from 'react';
import { TERMINAL_STATUSES } from '@forge/core';
import { useState } from 'react';
import { Link } from 'react-router';
import { useTicketBoard } from '#/api/use-tickets.js';
import { Button } from '#/components/ui/button.js';
import { TicketCostBreakdown } from '#/components/cost/cost-breakdown.js';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { cardPath } from '#/domain/card-paths.js';
import { formatWhen } from '#/domain/format-time.js';
import { TIER_WORDS } from '#/domain/finished-work-copy.js';
import { LANE_LABEL } from '#/domain/pipeline-copy.js';
import { TicketEditForm } from '#/routes/ticket/ticket-edit-form.js';
import { GateStrip } from '#/routes/ticket/ticket-side.js';
import type { TicketDetail } from '#/schemas/tickets.js';

const LINK = 'font-medium text-signal underline-offset-2 hover:underline';

export function DetailsTab(props: { slug: string; detail: TicketDetail }) {
  const { ticket } = props.detail;
  const [editing, setEditing] = useState(false);
  const board = useTicketBoard(props.slug);
  const rows: readonly [string, ReactNode][] = [
    ['Type', ticket.type],
    ['Care level', LANE_LABEL[ticket.lane]],
    [
      'Risk',
      `${TIER_WORDS[ticket.tier_actual ?? ticket.tier_predicted]}${ticket.tier_actual === undefined ? ' (predicted)' : ''}`,
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
    [
      'Depends on',
      ticket.blocked_by.length === 0
        ? 'Nothing'
        : ticket.blocked_by.map((id, index) => (
            <span key={id}>
              {index > 0 ? ', ' : ''}
              <TicketLink id={id} slug={props.slug} />
            </span>
          )),
    ],
    [
      'Part of',
      ticket.parent === undefined ? (
        'None'
      ) : (
        <TicketLink id={ticket.parent} slug={props.slug} />
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
      {TERMINAL_STATUSES.includes(ticket.status) ? null : (
        <section className="grid gap-2" aria-label="Edit">
          {editing ? (
            <TicketEditForm
              ticket={ticket}
              others={board.tickets}
              onDone={() => setEditing(false)}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => setEditing(true)}>Edit this ticket</Button>
              <span className="text-xs text-muted">
                Priority, what it waits for and, before work starts, its description.
              </span>
            </div>
          )}
        </section>
      )}
      <GateStrip results={props.detail.gate_results} />
      <section className="grid gap-2" aria-label="Cost">
        <h2 className="text-sm font-semibold">Cost</h2>
        <TicketCostBreakdown cost={props.detail.cost} />
      </section>
    </div>
  );
}
