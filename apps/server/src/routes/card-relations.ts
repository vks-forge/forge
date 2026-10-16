/**
 * `PUT /cards/:id/relations`: set a card's dependencies (d-0129, d-0141 item 2).
 *
 * Why: cards carry "depends on" and "blocks" links in both directions, settable from the card
 *   page after creation. The body is the card's complete set, so the page never has to diff;
 *   the engine replaces the edges after the same checks as creation (every id a card of the
 *   same project, no loop), in one transaction, and notes the change on the card's history.
 *   Answers 200 `{card}`, 400 `invalid_request` / `invalid_card_id` / `cross_project_dependency`,
 *   404 `card_not_found`, 409 `dependency_cycle` with the loop, 409 `card_closed` (a closed
 *   card takes no further change, as for PATCH).
 *
 * Exports: cardRelationsRoute().
 * Depends on: @forge/core (CardId), schemas/api, services/card-refusal, services/card-view,
 *   services/http/*, types/routes. IO: calls the engine, reads storage.
 */

import { CardId } from '@forge/core';
import type { CardActor } from '@forge/core';
import { CardRelationsBody } from '#/schemas/api.js';
import { refusalError } from '#/services/card-refusal.js';
import { summarizeCard, viewCard } from '#/services/card-view.js';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

const OWNER: CardActor = { type: 'user', id: 'owner' };

export function cardRelationsRoute(deps: RouteDeps): Route {
  return {
    method: 'PUT',
    path: '/cards/:id/relations',
    async handle({ req, res, params }) {
      const id = CardId.safeParse(params['id']);
      if (!id.success) {
        throw new HttpError(400, 'invalid_card_id', 'card id must look like FG-C12');
      }

      const body = await readJson(req, CardRelationsBody);
      const known = await deps.storage.transaction((tx) => tx.cards.get(id.data));
      if (known?.closed_reason !== undefined) {
        throw new HttpError(409, 'card_closed', `card ${known.id} is closed`);
      }

      const out = await deps.engine.setCardRelations(id.data, {
        depends_on: body.depends_on,
        blocks: body.blocks,
        actor: OWNER,
      });

      if (out.status !== 'updated') {
        throw refusalError(out);
      }

      const card = await deps.storage.transaction(async (tx) => {
        const slug = (await tx.projects.get(out.card.project))?.slug ?? out.card.project;

        return summarizeCard(
          await viewCard(
            tx,
            out.card,
            await tx.interactions.listPending(),
            await tx.cardRelations.listFor(out.card.id),
          ),
          slug,
        );
      });

      sendJson(res, 200, { card });
    },
  };
}
