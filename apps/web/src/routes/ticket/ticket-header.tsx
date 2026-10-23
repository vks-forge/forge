/**
 * TicketHeader: who this ticket is, where it stands and what it has cost, in one row, plus a
 *   slim line saying why it is not moving.
 *
 * Why: on arrival the owner needs the ticket's id and title, one status (amber only when it
 *   waits on them) and what it has cost so far, and then the Worker thread; the page below
 *   scrolls, this does not. It is the same row the Card page has (components/work), so moving
 *   between a card and its tickets does not change where things are. The pill says "Needs you"
 *   when something waits on the owner (the dock above the message box says what), otherwise the
 *   ticket's phase in words (Queued, Working, Held by re-plan...), with its lane and tier from a
 *   medium screen up. When the ticket is not moving the reason is one line under the row, the
 *   server's `wait` text with the tickets and card it names as links (d-0116), plus a blocked
 *   reason; a server that predates `wait` still gets the old "Waiting on" and "Not started" lines.
 *   The needs-you alert (components/work/needs-you-pill) sits under the row, so the owner sees it
 *   on every tab. "Waiting on" lists only the tickets the server says it still waits for
 *   (`open_blockers`) and only while the ticket is open: a finished ticket never shows a wait, it
 *   leads with one outcome sentence instead ("Ticket cancelled at 07:01", "Merged at ..."). The `⋯`
 *   menu carries "Cancel ticket…" whenever the server says `can_cancel`, opening the one cancel
 *   confirmation (routes/ticket/use-ticket-cancel). The cost chip's tooltip shows the total, then
 *   Workers and the Director. The pull request, the card it came from, rework count and per-run cost are in Details and Runs;
 *   nothing here is only a colour.
 *
 * Exports: TicketHeader.
 * Depends on: components/ui/whats-this, domain/plain-words, components/cost/cost-chip, components/ticket/{phase-chip,ticket-link},
 *   components/work/*, domain/board-columns, domain/cost-display, domain/nav-entries, domain/ticket-phase-copy,
 *   domain/ticket-status-copy, routes/ticket/use-ticket-cancel, schemas/tickets (type).
 */

import { NEEDS_YOU_STATUSES } from '@forge/core';
import type { ReactNode } from 'react';
import { CostChip } from '#/components/cost/cost-chip.js';
import { WaitLine } from '#/components/ticket/phase-chip.js';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { WhatsThis } from '#/components/ui/whats-this.js';
import { HeaderMenu } from '#/components/work/header-menu.js';
import { StatusPill } from '#/components/work/status-pill.js';
import { WorkHeader } from '#/components/work/work-header.js';
import { STATE_LABEL } from '#/domain/board-columns.js';
import { ticketCostSplit } from '#/domain/cost-display.js';
import { projectPath } from '#/domain/nav-entries.js';
import { careAndRisk } from '#/domain/plain-words.js';
import { phaseLabel, showsWaitLine } from '#/domain/ticket-phase-copy.js';
import { outcomeLine, openBlockersOf } from '#/domain/ticket-status-copy.js';
import { useTicketCancel } from '#/routes/ticket/use-ticket-cancel.js';
import type { TicketDetail } from '#/schemas/tickets.js';

export function TicketHeader(props: {
  slug: string;
  detail: TicketDetail;
  /** True when the dock has something waiting on the owner. */
  waiting: boolean;
  /** The button that opens Review, Runs and Details as a sheet (screens under 1024 px). */
  context?: ReactNode;
  /** The slim needs-you alert, drawn right under the title row. */
  alert?: ReactNode;
}) {
  const { ticket, wait_reason: waitReason, wait } = props.detail;
  // `waiting_human` alone is not "needs you": after an answer the ticket waits for the card's new
  // plan, and only the dock (an open owner item) says the owner must act.
  const needsYou =
    props.waiting ||
    (ticket.status !== 'waiting_human' && NEEDS_YOU_STATUSES.includes(ticket.status));

  const state = wait ? phaseLabel(wait.phase) : STATE_LABEL[ticket.status];
  const line = wait && showsWaitLine(wait.phase) ? wait : null;
  const care = careAndRisk(ticket.lane, ticket.tier_actual ?? ticket.tier_predicted);
  const cancel = useTicketCancel(props.detail);
  const blockers = openBlockersOf(props.detail);
  const outcome = outcomeLine(ticket);

  return (
    <>
      <WorkHeader
        backTo={projectPath(props.slug, 'board')}
        backLabel="Board"
        id={ticket.id}
        title={ticket.title}
        status={
          needsYou ? (
            <StatusPill
              tone="attn"
              label="Needs you"
              detail={STATE_LABEL[ticket.status]}
            />
          ) : (
            <span className="inline-flex min-w-0 items-center gap-1">
              <StatusPill tone="neutral" label={state} detail={care} />
              <WhatsThis term="care" />
            </span>
          )
        }
        cost={
          <CostChip
            usd={props.detail.cost?.total_usd}
            recorded={props.detail.cost?.by_run.some((run) => run.recorded) ?? false}
            label="Cost of this ticket"
            {...(props.detail.cost === undefined
              ? {}
              : { split: ticketCostSplit(props.detail.cost) })}
          />
        }
        context={props.context}
        menu={
          cancel.entries.length === 0 ? undefined : (
            <HeaderMenu label="Ticket actions" entries={cancel.entries} />
          )
        }
      />
      {cancel.dialog}
      {props.alert}
      {outcome === null ? null : (
        <p role="status" className="shrink-0 text-sm font-medium">
          {outcome}
        </p>
      )}
      {outcome === null &&
      (line ||
        ticket.blocked_reason ||
        (!wait && (blockers.length > 0 || waitReason))) ? (
        <div className="grid shrink-0 gap-0.5 text-sm text-muted">
          {line ? <WaitLine wait={line} slug={props.slug} className="text-sm" /> : null}
          {!wait && blockers.length > 0 ? (
            <p>
              Waiting on{' '}
              {blockers.map((id, index) => (
                <span key={id}>
                  {index > 0 ? ', ' : ''}
                  <TicketLink id={id} slug={props.slug} />
                </span>
              ))}
            </p>
          ) : null}
          {ticket.blocked_reason ? (
            <p className="text-fg">{ticket.blocked_reason}</p>
          ) : null}
          {!wait && waitReason ? (
            <p>
              Not started: <span className="font-data">{waitReason}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
