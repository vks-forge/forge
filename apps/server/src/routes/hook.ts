/**
 * `POST /runs/:id/hook`: where a Worker's harness hook reports tool events.
 *
 * Why: the hook process inside the harness is untrusted; this route hands each event to the
 *   hook handler, which checks the run's bearer token (sent as `Authorization: Bearer`),
 *   asks `admit()` and appends a signed receipt (d-0033). The route answers 200 with the
 *   handler's verdict even when it is `deny`: the hook client turns the verdict into its
 *   exit code, and any non-200 is a server fault it treats as fail-closed. A body that is
 *   not JSON is passed on as nothing, which the handler denies as `bad_request`. Tool
 *   outputs are bounded by the hook client, so this route accepts 2 MiB, not the usual 1 MiB
 *   and not more.
 *
 * Exports: HOOK_BODY_LIMIT, hookRoute().
 * Depends on: services/http/body, services/http/http-errors, services/http/respond,
 *   types/routes. IO: calls the hook handler.
 */

import { readJsonValue } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

/**
 * The hook client caps a tool output at 1 MiB (it sends a prefix plus the hash of anything
 * larger), so a legitimate request is a little over that at most; 2 MiB leaves room for the
 * tool input and rejects anything the client would not have sent.
 */
export const HOOK_BODY_LIMIT = 2 * 1024 * 1024;

const BEARER = /^Bearer (.+)$/i;

export function hookRoute(deps: RouteDeps): Route {
  return {
    method: 'POST',
    path: '/runs/:id/hook',
    // The harness hook cannot know the install token; it proves itself with its per-run secret.
    access: 'open',
    async handle({ req, res, params }) {
      const token = BEARER.exec(req.headers.authorization ?? '')?.[1] ?? '';

      let body: unknown;
      try {
        body = await readJsonValue(req, HOOK_BODY_LIMIT);
      } catch (error) {
        if (!(error instanceof HttpError) || error.status !== 400) {
          throw error;
        }
      }

      sendJson(res, 200, await deps.hooks.handle(params['id'] ?? '', token, body));
    },
  };
}
