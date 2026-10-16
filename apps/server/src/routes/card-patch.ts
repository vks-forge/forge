/**
 * `PATCH /cards/:id`: change a card's type, or close it with a reason.
 *
 * Why: the owner can re-file a card under another type (a Discussion that became real work)
 *   and can drop one that is a duplicate or not actionable. Both are deliberate acts, so each
 *   is written to the card's history with its actor in the same transaction as the change
 *   (d-0106 conversions keep history, d-0112 logs every action). The Board column is never
 *   patchable: it follows from the tickets and questions (d-0107), and `closed` is the one
 *   column an act sets, only by giving a reason. A type the registry does not know is 400,
 *   a type that does not accept the card's source is 409, and a closed card takes no further
 *   change (409), so a late request cannot quietly reopen or retype dropped work. Closing
 *   also moves the stored phase to `closed` through `transitionCard()`, so the phase and the
 *   reason never disagree.
 *
 * Exports: cardPatchRoute().
 * Depends on: @forge/core (CardId, CardPatchBody, checkTypeChange), services/card-phase, services/card-view,
 *   services/http/*, types/routes. IO: reads and writes storage.
 */

import { CardId, CardPatchBody, checkTypeChange } from '@forge/core';
import type { CardActor, NewCardEvent } from '@forge/core';
import { moveCardPhase } from '#/services/card-phase.js';
import { cardDetail, viewCard } from '#/services/card-view.js';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

const OWNER: CardActor = { type: 'user', id: 'owner' };

export function cardPatchRoute(deps: RouteDeps): Route {
  return {
    method: 'PATCH',
    path: '/cards/:id',
    async handle({ req, res, params }) {
      const id = CardId.safeParse(params['id']);
      if (!id.success) {
        throw new HttpError(400, 'invalid_card_id', 'card id must look like FG-C12');
      }

      const body = await readJson(req, CardPatchBody);
      const at = new Date(deps.now()).toISOString();

      const detail = await deps.storage.transaction(async (tx) => {
        const card = await tx.cards.get(id.data);
        if (!card) {
          throw new HttpError(404, 'card_not_found', `no card ${id.data}`);
        }

        if (card.closed_reason !== undefined) {
          throw new HttpError(409, 'card_closed', `card ${card.id} is closed`);
        }

        const events: NewCardEvent[] = [];
        const patch: { type?: string; closed_reason?: string } = {};
        if (body.type !== undefined && body.type !== card.type) {
          const next = await tx.cardTypes.get(body.type);
          const check = checkTypeChange(card, next, body.type);
          if (!check.ok) {
            throw new HttpError(
              check.code === 'unknown_card_type' ? 400 : 409,
              check.code,
              check.message,
            );
          }

          patch.type = body.type;
          events.push({
            kind: 'type_changed',
            at,
            actor: OWNER,
            payload: { from: card.type, to: body.type },
          });
        }

        if (body.closed_reason !== undefined) {
          patch.closed_reason = body.closed_reason;
          events.push({
            kind: 'card_closed',
            at,
            actor: OWNER,
            payload: { reason: body.closed_reason },
          });
        }

        if (events.length > 0) {
          await tx.cards.update(card.id, { ...patch, updated_at: at });
          for (const event of events) {
            await tx.cardEvents.append(card.id, event);
          }
        }

        if (body.closed_reason !== undefined) {
          // The phase follows the reason through the one door, so Board and phase agree.
          await moveCardPhase(tx, card.id, { type: 'close' }, at);
        }

        const slug = (await tx.projects.get(card.project))?.slug ?? card.project;
        const fresh = (await tx.cards.get(card.id)) ?? card;
        const view = await viewCard(
          tx,
          fresh,
          await tx.interactions.listPending(),
          await tx.cardRelations.listFor(card.id),
        );

        return cardDetail(tx, view, slug, deps.engine.cardDirector(card.id));
      });

      sendJson(res, 200, detail);
    },
  };
}
