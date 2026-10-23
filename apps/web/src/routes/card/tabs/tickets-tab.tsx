/**
 * TicketsTab: the Tickets tab of the Card page, a timeline of the card's linked tickets.
 *
 * Why: once the Director turns a card into work, the user wants to see what was built for it
 *   and where each piece stands without leaving the card. Tickets are listed in the order they
 *   were created, each with its phase in words (Queued, Working, Held by re-plan...; amber only
 *   when it waits on the user) and, when it adds something, the line that says why (links to the tickets and card it names),
 *   run status, lane, cost (muted; a dash when the server sent none) and last change, and each is
 *   one link to its Ticket page (d-0116) where the live Worker thread and the steer box live. A card with no tickets says so and why that is normal (talk-only
 *   types start with none).
 *
 * Exports: TicketsTab.
 * Depends on: react, @forge/core (type), components/ticket/*, components/cost/cost-chip,
 *   domain/relative-time, domain/ticket-phase-copy, state/use-now.
 */

import type { TicketSummary } from '@forge/core';
import { CostChip } from '#/components/cost/cost-chip.js';
import { PhaseChip, WaitLine } from '#/components/ticket/phase-chip.js';
import { LaneChip, RunChip, StateChip } from '#/components/ticket/status-chips.js';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { showsWaitLine } from '#/domain/ticket-phase-copy.js';
import { timeAgo } from '#/domain/relative-time.js';
import { useNow } from '#/state/use-now.js';
import { EmptyState } from '#/components/ui/empty-state.js';
import { Ticket } from 'lucide-react';

export function TicketsTab(props: { slug: string; tickets: readonly TicketSummary[] }) {
  const now = useNow();
  const ordered = [...props.tickets].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  if (ordered.length === 0) {
    return (
      <EmptyState icon={Ticket} title="No tickets yet">
        The Director creates them when this card turns into work; a discussion or a plan
        can stay talk-only for a while.
      </EmptyState>
    );
  }

  return (
    <ol aria-label="Tickets of this card" className="mx-auto grid max-w-3xl gap-0">
      {ordered.map((ticket, index) => (
        <li key={ticket.id} className="relative grid gap-1.5 pb-5 pl-6 last:pb-0">
          <span
            aria-hidden="true"
            className={`absolute left-[5px] top-1.5 size-2.5 rounded-full ${ticket.needs_you ? 'bg-attn' : 'bg-faint'}`}
          />
          {index < ordered.length - 1 ? (
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-[9px] top-4 w-px bg-line"
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <TicketLink id={ticket.id} slug={props.slug} />
            {ticket.wait ? (
              <PhaseChip phase={ticket.wait.phase} />
            ) : (
              <StateChip state={ticket.state} needsYou={ticket.needs_you} />
            )}
            <LaneChip lane={ticket.lane} />
            {ticket.run_status && ticket.wait?.phase !== 'working' ? (
              <RunChip status={ticket.run_status} />
            ) : null}
            <CostChip
              usd={ticket.cost_usd}
              recorded={(ticket.cost_usd ?? 0) > 0}
              label={`Cost of ${ticket.id}`}
              className="ml-auto"
            />
          </div>
          <p className="text-sm">{ticket.title}</p>
          {ticket.wait && showsWaitLine(ticket.wait.phase) ? (
            <WaitLine wait={ticket.wait} slug={props.slug} />
          ) : null}
          <p className="text-xs text-muted">
            Created {timeAgo(ticket.created_at, now)}, changed{' '}
            {timeAgo(ticket.updated_at, now)}
          </p>
        </li>
      ))}
    </ol>
  );
}
