/**
 * Ticket edit rules — what may change on a ticket, and which dependency edges are valid.
 *
 * Why: the owner's ticket page and the card's Director both edit tickets, and a bad edit is
 *   costly: a loop between two tickets leaves both Queued forever, a dependency on another
 *   project's ticket is never satisfied, a changed brief on a running ticket is a change the
 *   Worker never sees, and a new dependency on a running ticket would block work mid-run.
 *   One pure check answers all of it, so the route and the chat refuse the same things with the
 *   same plain words. Priority is always editable on an open ticket; a done dependency is
 *   allowed (it is satisfied), a cancelled one is not (it never will be). Fail closed.
 *
 * Exports: checkTicketEdit(), TICKET_NOT_STARTED.
 * Depends on: domain/graph-cycle, schemas/ticket, schemas/ticket-edit, types/ticket-edit. No IO.
 */

import { findCycle } from '#/domain/graph-cycle.js';
import type { TicketId } from '#/schemas/ids.js';
import { TERMINAL_STATUSES } from '#/schemas/ticket.js';
import type { TicketStatus } from '#/schemas/ticket.js';
import type { TicketEditBody } from '#/schemas/ticket-edit.js';
import type {
  TicketEditCheck,
  TicketEditFacts,
  TicketEditRefusalCode,
} from '#/types/ticket-edit.types.js';

/** Statuses where no Worker has the brief yet: description and new dependencies are still safe to change. */
export const TICKET_NOT_STARTED: readonly TicketStatus[] = ['inbox', 'planned'];

function refuse(
  code: TicketEditRefusalCode,
  message: string,
  ids: readonly string[] = [],
): TicketEditCheck {
  return { ok: false, code, message, ids };
}

/** Checks `edit` against `facts`; the first refusal wins. */
export function checkTicketEdit(
  edit: TicketEditBody,
  facts: TicketEditFacts,
): TicketEditCheck {
  const { ticket } = facts;
  if (TERMINAL_STATUSES.includes(ticket.status)) {
    return refuse(
      'ticket_closed',
      `${ticket.id} is ${ticket.status} and takes no change`,
    );
  }

  const notStarted = TICKET_NOT_STARTED.includes(ticket.status);
  if (edit.body !== undefined && !notStarted) {
    return refuse(
      'description_locked',
      `${ticket.id} has already started, so its Worker has its brief; the description can only change before work starts`,
    );
  }

  if (edit.depends_on === undefined) {
    return { ok: true };
  }

  const added = [...new Set<string>(edit.depends_on)].filter(
    (id) => !facts.currentDependsOn.includes(id),
  );

  if (added.length > 0 && !notStarted) {
    return refuse(
      'dependency_on_started_ticket',
      `${ticket.id} has already started, so it cannot be made to wait for another ticket`,
      added,
    );
  }

  for (const id of added) {
    if (id === ticket.id) {
      return refuse('self_dependency', `${ticket.id} cannot wait for itself`, [id]);
    }

    const target = facts.targets.get(id);
    if (!target) {
      return refuse('dependency_not_found', `there is no ticket ${id}`, [id]);
    }

    if (target.project !== ticket.project) {
      return refuse(
        'cross_project_dependency',
        `${id} belongs to another project, so ${ticket.id} cannot wait for it`,
        [id],
      );
    }

    if (target.status === 'cancelled') {
      return refuse(
        'dependency_cancelled',
        `${id} is cancelled and will never finish, so ${ticket.id} cannot wait for it`,
        [id],
      );
    }
  }

  const cycle = findCycle(
    facts.edges,
    added.map((to) => ({ from: ticket.id, to: to as TicketId })),
  );

  return cycle
    ? refuse(
        'dependency_cycle',
        `that would make tickets wait on each other: ${cycle.join(' -> ')}`,
        cycle,
      )
    : { ok: true };
}
