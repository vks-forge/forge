/**
 * `POST /interactions/:id/answer`: a human answers a parked ticket's question.
 *
 * Why: a Worker that needs a person pauses and the ticket waits (director-core.md §8). The
 *   answer is accepted exactly once: the engine answers by compare-and-swap, so a double
 *   click or a retry after a timeout gets 409 instead of waking the ticket twice. An
 *   unknown id is 404, which tells the caller their id is wrong rather than that someone
 *   else got there first.
 *
 * Exports: answerRoute().
 * Depends on: schemas/api, services/http/body, services/http/http-errors,
 *   services/http/respond, types/routes. IO: reads storage, calls the engine.
 */

import { AnswerBody } from '#/schemas/api.js';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function answerRoute(deps: RouteDeps): Route {
  return {
    method: 'POST',
    path: '/interactions/:id/answer',
    async handle({ req, res, params }) {
      const id = params['id'] ?? '';
      const { answer } = await readJson(req, AnswerBody);

      const known = await deps.storage.transaction((tx) => tx.interactions.get(id));
      if (!known) {
        throw new HttpError(404, 'interaction_not_found', `no interaction ${id}`);
      }

      if (!(await deps.engine.answerInteraction(id, answer))) {
        throw new HttpError(409, 'not_pending', `interaction ${id} is not pending`);
      }

      sendJson(res, 200, { id, status: 'answered' });
    },
  };
}
