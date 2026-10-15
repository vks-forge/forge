/**
 * `POST /cards/:id/messages`: the user says something to the card's Director.
 *
 * Why: d-0109 makes the card page a conversation with the Director about the whole request.
 *   A model call can take a minute, so the request only stores the message and answers
 *   `202 {event}` (the stored `user_message`); the Director's reply, and anything it did,
 *   arrive later as card events on `GET /cards/:id/events`, and `GET /cards/:id` carries
 *   `director.state` so the page can show it is thinking. Refusals say why nothing was
 *   stored: 400 bad body or card id, 404 `card_not_found`, 409 `card_closed` (a closed card
 *   takes no chat, so a message is never left looking unanswered), 503 `server_draining`
 *   (the server is stopping and would drop the queued reply).
 *
 * Exports: cardMessageRoute().
 * Depends on: @forge/core (CardId, CardMessageBody), services/http/*, types/routes.
 *   IO: calls the engine.
 */

import { CardId, CardMessageBody } from '@forge/core';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function cardMessageRoute(deps: RouteDeps): Route {
  return {
    method: 'POST',
    path: '/cards/:id/messages',
    async handle({ req, res, params }) {
      if (deps.isDraining?.()) {
        // Written here, not thrown: the error mapper hides every 5xx behind `internal`.
        sendJson(res, 503, {
          error: {
            code: 'server_draining',
            message: 'the server is shutting down; send the message after it restarts',
          },
        });

        return;
      }

      const id = CardId.safeParse(params['id']);
      if (!id.success) {
        throw new HttpError(400, 'invalid_card_id', 'card id must look like FG-C12');
      }

      const body = await readJson(req, CardMessageBody);
      const out = await deps.engine.postCardMessage(id.data, body.text, body.author);
      if (out.status === 'not_found') {
        throw new HttpError(404, 'card_not_found', `no card ${id.data}`);
      }

      if (out.status === 'closed') {
        throw new HttpError(
          409,
          'card_closed',
          `card ${id.data} is closed and takes no chat`,
        );
      }

      sendJson(res, 202, { event: out.event });
    },
  };
}
