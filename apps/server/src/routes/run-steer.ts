/**
 * `POST /runs/:id/steer`: a person messages a running Worker directly.
 *
 * Why: d-0109 gives every ticket page its Worker's live thread and lets the user talk to
 *   that Worker (steer) without going through the card's Director. The run, not the ticket,
 *   is the addressable thing: the thread is `GET /runs/:id/events`, and a ticket may have had
 *   several runs. The body is `{message, author}`; the engine stores the message in the run
 *   inbox and the event stream before delivering it, so a thread that is already open shows
 *   it at once. Refusals tell the caller why nothing was sent: 400 bad body, 404 no such
 *   run, 409 `run_not_live` (ended, interrupted, or another server's), 409 `steer_unsupported`
 *   (the Worker's harness cannot take a live message), 503 `server_draining` (the server is
 *   stopping; the run is about to be interrupted and resumed, so a message now could be lost).
 *
 * Exports: runSteerRoute().
 * Depends on: @forge/core (SteerRunBody), services/http/*, types/routes. IO: reads storage,
 *   calls the engine.
 */

import { SteerRunBody } from '@forge/core';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function runSteerRoute(deps: RouteDeps): Route {
  return {
    method: 'POST',
    path: '/runs/:id/steer',
    async handle({ req, res, params }) {
      if (deps.isDraining?.()) {
        // Written here, not thrown: the error mapper hides every 5xx behind `internal`,
        // and the caller needs the code to tell "stopping" from "broken".
        sendJson(res, 503, {
          error: {
            code: 'server_draining',
            message: 'the server is shutting down; send the message after it restarts',
          },
        });

        return;
      }

      const runId = params['id'] ?? '';
      const body = await readJson(req, SteerRunBody);
      const run = await deps.storage.transaction((tx) => tx.runs.get(runId));
      if (!run) {
        throw new HttpError(404, 'run_not_found', `no run ${runId}`);
      }

      const notLive = new HttpError(
        409,
        'run_not_live',
        `run ${runId} is not running on this server`,
      );

      if (run.owner !== deps.owner) {
        throw notLive;
      }

      const outcome = await deps.engine.steerRun(runId, body.message, body.author);
      if (outcome.status === 'not_live') {
        throw notLive;
      }

      if (outcome.status === 'unsupported') {
        throw new HttpError(
          409,
          'steer_unsupported',
          `the harness of run ${runId} cannot take a message while it runs`,
        );
      }

      sendJson(res, 200, {
        run_id: runId,
        inbox_seq: outcome.inboxSeq,
        mode: 'steer',
        status: 'delivered',
      });
    },
  };
}
