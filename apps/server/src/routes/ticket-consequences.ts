/**
 * `GET /tickets/:id/consequences?action=replan|cancel|merge_anyway`: what the action would change.
 *
 * Why: Re-plan, Cancel ticket and Merge anyway are confirmed in a popup that must list the real
 *   effect (which tickets are held, what is deleted, which check is overruled), read live when the
 *   popup opens so it cannot go stale on a screen that was open for an hour. A read only: acting
 *   still goes through `POST /tickets/:id/act` or `/interactions/:id/act`, which judge the act.
 *
 * Exports: ticketConsequencesRoute().
 * Depends on: @forge/core (ConsequenceAction, TicketId, ActionConsequences), services/action-consequences,
 *   services/http/*, types/routes. IO: reads storage.
 */

import { ActionConsequences, ConsequenceAction, TicketId } from '@forge/core';
import { actionConsequences } from '#/services/action-consequences.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function ticketConsequencesRoute(deps: RouteDeps): Route {
  return {
    method: 'GET',
    path: '/tickets/:id/consequences',
    async handle({ res, params, url }) {
      const id = TicketId.safeParse(params['id']);
      if (!id.success) {
        throw new HttpError(400, 'invalid_ticket_id', 'ticket id must look like FG-12');
      }

      const action = ConsequenceAction.safeParse(url.searchParams.get('action'));
      if (!action.success) {
        throw new HttpError(
          400,
          'invalid_action',
          'action must be replan, cancel or merge_anyway',
        );
      }

      const found = await deps.storage.transaction((tx) =>
        actionConsequences(tx, id.data, action.data),
      );

      if (found === null) {
        throw new HttpError(404, 'ticket_not_found', `no ticket ${id.data}`);
      }

      sendJson(res, 200, ActionConsequences.parse(found));
    },
  };
}
