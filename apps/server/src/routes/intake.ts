/**
 * `POST /intake`: a trigger hands the Director an event.
 *
 * Why: chat, webhooks and cron all reach the Director as intake events (director-core.md
 *   §7). The body is routed by its `source` to the registered trigger adapter, which
 *   validates it into an `IntakeEvent`, so a new source needs no change here and a source
 *   nobody registered is refused with 400 before the engine sees it (fail closed, d-0002).
 *   A source that only polls cannot be pushed to. The answer is 202 with what the engine did
 *   with it (a ticket was created, it was a duplicate, it was ignored and why): the work
 *   happens on the next tick, not in the request, so a model outage never fails an intake call.
 *
 * Exports: intakeRoute().
 * Depends on: services/http/body, services/http/http-errors, services/http/respond,
 *   types/routes. IO: calls the engine.
 */

import { ZodError } from 'zod';
import { readJsonValue } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

function sourceOf(raw: unknown): string | undefined {
  const source = (raw as { source?: unknown } | null)?.source;

  return typeof source === 'string' ? source : undefined;
}

export function intakeRoute(deps: RouteDeps): Route {
  return {
    method: 'POST',
    path: '/intake',
    async handle({ req, res }) {
      const raw = await readJsonValue(req);
      const adapter = deps.triggers.forSource(sourceOf(raw) ?? '');
      if (!adapter?.capabilities().push) {
        throw new HttpError(
          400,
          'unknown_trigger_source',
          'no trigger accepts pushed events for this source',
        );
      }

      let event;
      try {
        event = adapter.normalise(raw);
      } catch (error) {
        throw error instanceof ZodError ? HttpError.fromZod(error) : error;
      }

      const result = await deps.engine.ingest(event);

      sendJson(res, 202, result);
    },
  };
}
