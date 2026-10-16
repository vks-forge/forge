/**
 * `POST /projects/:slug/cards`: the create-card form (d-0128, d-0138), replacing chat intake in the UI.
 *
 * Why: a request starts as a card the Director plans before anything is worked, so the form
 *   sends the owner's words, type, priority, dependencies and links in one validated body. The
 *   engine creates the card in `grilling`, makes no ticket, writes the title and description
 *   as the first card event and queues the Director's reply in one transaction, so the Card
 *   page opens on a conversation that is about to start. Answers: 201 `{card}`; the same
 *   `dedupe_key` again returns the first card with 200, so a double click makes one;
 *   400 `invalid_request` for a body that fails validation or a type that does not take chat,
 *   404 `project_not_found` or `card_not_found` (an unknown dependency), 400
 *   `cross_project_dependency`, 409 `dependency_cycle` with the loop, 409 `project_archived`,
 *   503 `server_draining` while the server stops.
 *
 * Exports: cardCreateRoute().
 * Depends on: schemas/api, services/card-refusal, services/card-view, services/http/*, types/routes.
 *   IO: calls the engine, reads storage.
 */

import type { CardActor } from '@forge/core';
import { CardCreateBody } from '#/schemas/api.js';
import { refusalError } from '#/services/card-refusal.js';
import { summarizeCard, viewCard } from '#/services/card-view.js';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

const OWNER: CardActor = { type: 'user', id: 'owner' };

export function cardCreateRoute(deps: RouteDeps): Route {
  return {
    method: 'POST',
    path: '/projects/:slug/cards',
    async handle({ req, res, params }) {
      const slug = params['slug'] ?? '';
      if (deps.isDraining?.()) {
        // Written here, not thrown: the error mapper hides every 5xx behind `internal`.
        sendJson(res, 503, {
          error: {
            code: 'server_draining',
            message: 'the server is shutting down; create the card after it restarts',
          },
        });

        return;
      }

      const body = await readJson(req, CardCreateBody);
      const out = await deps.engine.createCard({
        project: slug,
        title: body.title,
        description: body.description,
        type: body.type,
        priority: body.priority,
        depends_on: body.depends_on,
        blocks: body.blocks,
        links: body.links,
        dedupe_key: body.dedupe_key,
        actor: OWNER,
      });

      switch (out.status) {
        case 'project_not_found':
          throw new HttpError(404, 'project_not_found', `no project ${slug}`);
        case 'project_archived':
          throw new HttpError(409, 'project_archived', `project ${slug} is archived`);
        case 'invalid_type':
          throw new HttpError(400, 'invalid_request', out.reason);
        case 'created':
        case 'duplicate': {
          const card = await deps.storage.transaction(async (tx) =>
            summarizeCard(
              await viewCard(
                tx,
                out.card,
                await tx.interactions.listPending(),
                await tx.cardRelations.listFor(out.card.id),
              ),
              slug,
            ),
          );

          sendJson(res, out.status === 'created' ? 201 : 200, { card });

          return;
        }

        default:
          throw refusalError(out);
      }
    },
  };
}
