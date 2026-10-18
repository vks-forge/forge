/**
 * `PATCH /cards/:id`: change a card's type, close it with a reason, or set its budget cap.
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
 *   reason never disagree, then asks the engine to cancel the card's unfinished tickets (a closed
 *   card must not leave work running or waiting).
 *
 * Exports: cardPatchRoute().
 * Depends on: @forge/core (CardId, CardPatchBody, checkTypeChange), @forge/engine (warnOnBudget), services/card-phase, services/card-view,
 *   services/http/*, types/routes. IO: reads and writes storage.
 */

import { CardId, CardPatchBody, checkTypeChange } from '@forge/core';
import type { CardActor, NewCardEvent } from '@forge/core';
import { warnOnBudget } from '@forge/engine';
import { moveCardPhase } from '#/services/card-phase.js';
import { cardDetail, viewCard } from '#/services/card-view.js';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

const OWNER: CardActor = { type: 'user', id: 'owner' };

/** The Director's warning level, which a card without its own cap uses; undefined when the settings cannot be read. */
async function companyWarningLevel(deps: RouteDeps): Promise<number | undefined> {
  try {
    return (await deps.config.company()).config.director.budget_warning_usd;
  } catch {
    return undefined;
  }
}

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
      // Read before the transaction: settings and storage share one writer queue.
      const warningLevel =
        body.budget_cap_usd === undefined ? undefined : await companyWarningLevel(deps);

      const detail = await deps.storage.transaction(async (tx) => {
        const card = await tx.cards.get(id.data);
        if (!card) {
          throw new HttpError(404, 'card_not_found', `no card ${id.data}`);
        }

        if (card.closed_reason !== undefined) {
          throw new HttpError(409, 'card_closed', `card ${card.id} is closed`);
        }

        const events: NewCardEvent[] = [];
        const patch: {
          type?: string;
          closed_reason?: string;
          budget_cap_usd?: number | undefined;
        } = {};

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

        // The owner's budget cap only warns, never blocks (d-0143); null clears it. Warnings are measured
        // against the cap in force, so a changed cap warns afresh once spend has reached a threshold of it.
        if (body.budget_cap_usd !== undefined) {
          patch.budget_cap_usd = body.budget_cap_usd ?? undefined;
        }

        if (events.length > 0 || body.budget_cap_usd !== undefined) {
          await tx.cards.update(card.id, { ...patch, updated_at: at });
          for (const event of events) {
            await tx.cardEvents.append(card.id, event);
          }
        }

        if (body.closed_reason !== undefined) {
          // The phase follows the reason through the one door, so Board and phase agree.
          await moveCardPhase(tx, card.id, { type: 'close' }, at);
        } else if (body.budget_cap_usd !== undefined) {
          await warnOnBudget(tx, card.id, at, warningLevel);
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

      // Closing also closes the card's work (its tickets, their waits and live runs), after the
      // card itself committed; the engine's start-up sweep repairs a crash between the two.
      if (body.closed_reason !== undefined) {
        await deps.engine.closeCardWork(id.data);
      }

      sendJson(res, 200, detail);
    },
  };
}
