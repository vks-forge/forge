/**
 * `POST /interactions/:id/answer`: a human answers a parked ticket's question.
 *
 * Why: a Worker that needs a person pauses and the ticket waits (director-core.md §8). The
 *   answer is accepted exactly once: the engine answers by compare-and-swap, so a double
 *   click or a retry after a timeout gets 409 instead of waking the ticket twice. An
 *   unknown id is 404, which tells the caller their id is wrong rather than that someone
 *   else got there first. This is the older route: it stays for callers that only answer, and
 *   settles the answer the same way `POST /interactions/:id/act` does (the owner's typed answer),
 *   but at any stage. The reply carries `next`, the plain line of what happens to the ticket now.
 *
 * Exports: answerRoute().
 * Depends on: schemas/api, services/http/body, services/http/http-errors,
 *   services/http/respond, types/routes. IO: reads storage, calls the engine.
 */

import { AnswerBody, AnswerReply } from '#/schemas/api.js';
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

      // The same settle as `act` with an answer (a typed owner answer, the same wake), but taken at
      // any stage: this older route never learned that the Director may still be looking.
      if (!(await deps.engine.answerInteraction(id, answer))) {
        throw new HttpError(409, 'not_pending', `interaction ${id} is not pending`);
      }

      const next = (await deps.engine.explainWaits([known.ticket_id])).get(
        known.ticket_id,
      )?.text;

      sendJson(
        res,
        200,
        AnswerReply.parse({
          id,
          status: 'answered',
          ...(next === undefined ? {} : { next }),
        }),
      );
    },
  };
}
