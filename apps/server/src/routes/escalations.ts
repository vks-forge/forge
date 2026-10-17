/**
 * The escalation routes: act on a waiting ticket, and list a card's waits.
 *
 * Why: every wait on the owner is one escalation (a question, a failure, a setup) and the owner
 *   acts on it from the Inbox, the Card page and the Ticket page through one door. `POST
 *   /interactions/:id/act` settles an escalation with an action it offers; `POST /tickets/:id/act`
 *   is the same for the waits that have no interaction behind them (finished work waiting for
 *   review or sign-off, a ticket the scheduler holds back), where only Rework and Cancel exist.
 *   `GET /cards/:id/escalations` is what the card chat renders live, so a wait shows its settled
 *   state wherever it was answered. Nothing here writes storage: the engine's doors do, and its
 *   tracked writes announce the change on the project stream. Refusals are mapped in one place
 *   (services/escalation-refusal).
 *
 * Exports: escalationRoutes().
 * Depends on: @forge/core (EscalationActBody, TicketActReply, CardId, TicketId), services/escalation-view,
 *   services/escalation-refusal, services/http/*, types/routes. IO: calls the engine, reads storage.
 */

import type { IncomingMessage } from 'node:http';
import { CardId, EscalationActBody, TicketActReply, TicketId } from '@forge/core';
import { escalationRefusal } from '#/services/escalation-refusal.js';
import { cardEscalations, escalationViews } from '#/services/escalation-view.js';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** The `author` the engine records for every owner action. */
const OWNER = 'owner';

/** The act body, refused with the contract's `invalid_body` (the server's generic code for a bad body is `invalid_request`). */
async function readAct(req: IncomingMessage): Promise<EscalationActBody> {
  try {
    return await readJson(req, EscalationActBody);
  } catch (e) {
    if (e instanceof HttpError && e.status === 400 && e.code === 'invalid_request') {
      throw new HttpError(400, 'invalid_body', e.message, {
        ...(e.issues ? { issues: e.issues } : {}),
      });
    }

    throw e;
  }
}

export function escalationRoutes(deps: RouteDeps): Route[] {
  const act: Route = {
    method: 'POST',
    path: '/interactions/:id/act',
    async handle({ req, res, params }) {
      const id = params['id'] ?? '';
      const body = await readAct(req);
      const out = await deps.engine.actOnEscalation(id, body, OWNER);
      if (out.status !== 'done') {
        throw escalationRefusal(out, id, 'interaction');
      }

      const [escalation] = await deps.storage.transaction(async (tx) => {
        const row = await tx.interactions.get(id);

        return row ? escalationViews(tx, [row]) : [];
      });

      sendJson(res, 200, { escalation });
    },
  };

  const actOnTicket: Route = {
    method: 'POST',
    path: '/tickets/:id/act',
    async handle({ req, res, params }) {
      const id = TicketId.safeParse(params['id']);
      if (!id.success) {
        throw new HttpError(400, 'invalid_ticket_id', 'ticket id must look like FG-12');
      }

      const body = await readAct(req);
      const out = await deps.engine.actOnTicket(id.data, body, OWNER);
      if (out.status !== 'done') {
        throw escalationRefusal(out, id.data, 'ticket');
      }

      sendJson(
        res,
        200,
        TicketActReply.parse({ ticket_id: id.data, action: body.action }),
      );
    },
  };

  const forCard: Route = {
    method: 'GET',
    path: '/cards/:id/escalations',
    async handle({ res, params }) {
      const id = CardId.safeParse(params['id']);
      if (!id.success) {
        throw new HttpError(400, 'invalid_card_id', 'card id must look like FG-C12');
      }

      const items = await deps.storage.transaction(async (tx) =>
        (await tx.cards.get(id.data)) ? cardEscalations(tx, id.data) : null,
      );

      if (items === null) {
        throw new HttpError(404, 'card_not_found', `no card ${id.data}`);
      }

      sendJson(res, 200, { items });
    },
  };

  return [act, actOnTicket, forCard];
}
