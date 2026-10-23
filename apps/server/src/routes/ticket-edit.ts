/**
 * `PATCH /tickets/:id`: change a ticket's priority, description or dependencies.
 *
 * Why: tickets used to be written only by plan approval, so the owner could not raise a
 *   priority, correct a brief or order one ticket before another (restored work could not be
 *   put ahead of the tickets that needed it). The body names any of `body`, `priority` and
 *   `depends_on` (the ticket's complete set); the engine applies it in one transaction after the
 *   shared checks and notes the change on the card. Answers 200 `{ticket}`, 400 `invalid_request` /
 *   `invalid_ticket_id` / `self_dependency` / `cross_project_dependency`, 404 `ticket_not_found` /
 *   `dependency_not_found`, 409 `ticket_closed` / `description_locked` /
 *   `dependency_on_started_ticket` / `dependency_cancelled` / `dependency_cycle` (with the loop) /
 *   `ticket_changed` (lost a race, retry).
 *
 * Exports: ticketEditRoute().
 * Depends on: @forge/core (TicketId, TicketEditBody), services/http/*, types/routes.
 *   IO: calls the engine.
 */

import { TicketEditBody, TicketId } from '@forge/core';
import type { CardActor, TicketEditRefusalCode } from '@forge/core';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

const OWNER: CardActor = { type: 'user', id: 'owner' };

const STATUS: Record<TicketEditRefusalCode, number> = {
  ticket_closed: 409,
  description_locked: 409,
  dependency_on_started_ticket: 409,
  dependency_cancelled: 409,
  dependency_cycle: 409,
  self_dependency: 400,
  cross_project_dependency: 400,
  dependency_not_found: 404,
};

export function ticketEditRoute(deps: RouteDeps): Route {
  return {
    method: 'PATCH',
    path: '/tickets/:id',
    async handle({ req, res, params }) {
      const id = TicketId.safeParse(params['id']);
      if (!id.success) {
        throw new HttpError(400, 'invalid_ticket_id', 'ticket id must look like FG-12');
      }

      const body = await readJson(req, TicketEditBody);
      const out = await deps.engine.editTicket(id.data, body, OWNER);

      if (out.status === 'ticket_not_found') {
        throw new HttpError(404, 'ticket_not_found', `no ticket ${id.data}`);
      }

      if (out.status === 'stale') {
        throw new HttpError(409, 'ticket_changed', `${id.data} just changed; try again`);
      }

      if (out.status === 'refused') {
        throw new HttpError(
          STATUS[out.code],
          out.code,
          out.message,
          out.code === 'dependency_cycle' ? { cycle: out.ids } : {},
        );
      }

      sendJson(res, 200, { ticket: out.ticket });
    },
  };
}
