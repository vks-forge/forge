/**
 * `GET /tickets/:id`: one ticket with its runs, gate results and open questions.
 *
 * Why: the Ticket screen and the CLI need the whole story of a ticket in one call: where it
 *   is, which runs worked on it, what the gates said and what is waiting for a human. They
 *   are read in one transaction so the picture is consistent (a run row never ahead of
 *   its ticket). Only pending interactions are listed; answered ones are history. A ticket
 *   that has not started also says why in `wait_reason` (`quota: claude-code until 14:20 UTC`,
 *   `cap: per-project 1/1`, `deps: PAY-231`), computed by the scheduler's own decision so the
 *   page cannot disagree with dispatch; it is null when nothing holds the ticket back.
 *
 * Exports: ticketRoute().
 * Depends on: @forge/core (TicketId), services/http/http-errors, services/http/respond,
 *   types/routes. IO: reads storage and the engine's read-only wait explanation.
 */

import { TicketId } from '@forge/core';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function ticketRoute(deps: RouteDeps): Route {
  return {
    method: 'GET',
    path: '/tickets/:id',
    async handle({ res, params }) {
      const id = TicketId.safeParse(params['id']);
      if (!id.success) {
        throw new HttpError(400, 'invalid_ticket_id', 'ticket id must look like FG-12');
      }

      const found = await deps.storage.transaction(async (tx) => {
        const ticket = await tx.tickets.get(id.data);
        if (!ticket) {
          return null;
        }

        const [runs, gates, interactions] = await Promise.all([
          tx.runs.listByTicket(ticket.id),
          tx.gateResults.listByTicket(ticket.id),
          tx.interactions.listByTicket(ticket.id),
        ]);

        return {
          ticket,
          runs,
          gate_results: gates,
          interactions: interactions.filter((i) => i.status === 'pending'),
        };
      });

      if (!found) {
        throw new HttpError(404, 'ticket_not_found', `no ticket ${id.data}`);
      }

      sendJson(res, 200, {
        ...found,
        wait_reason: await deps.engine.explainWait(found.ticket.id),
      });
    },
  };
}
