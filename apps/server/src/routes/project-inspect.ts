/**
 * `POST /projects/inspect`: a dry run of registering a project on a folder.
 *
 * Why: the new-project form should tell the user a folder is wrong while they are still
 *   choosing it, not after they filled in five more fields and pressed Create. The checks and
 *   the answer (git state, snapshot size, branches, ecosystems, checks, a free slug and
 *   prefix) are built by `services/project-inspect`, the same code path registration relies
 *   on; this route only parses the body and sends the result. It never creates, writes or
 *   fetches anything.
 *
 *   `GET /projects/:slug/detected` answers what Forge detects in a registered project's folder now
 *   (ecosystems, suggested checks, the setup steps it would run before each ticket) and writes
 *   nothing; `POST` does the same and records the ecosystems on the project row ("Detect again").
 *
 * Exports: projectInspectRoutes().
 * Depends on: schemas/api, services/project-inspect, services/project-detected, services/http/*, types/routes. IO: reads storage and the folder.
 */

import { ProjectInspectBody } from '#/schemas/api.js';
import { readJson } from '#/services/http/body.js';
import { sendJson } from '#/services/http/respond.js';
import { detectedFor, refreshDetected } from '#/services/project-detected.js';
import { inspectProject } from '#/services/project-inspect.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function projectInspectRoutes(deps: RouteDeps): Route[] {
  return [
    {
      method: 'POST',
      path: '/projects/inspect',
      async handle(ctx) {
        const body = await readJson(ctx.req, ProjectInspectBody);
        sendJson(ctx.res, 200, await inspectProject(deps, body));
      },
    },
    {
      method: 'GET',
      path: '/projects/:slug/detected',
      async handle(ctx) {
        sendJson(ctx.res, 200, await detectedFor(deps, ctx.params['slug'] ?? ''));
      },
    },
    {
      method: 'POST',
      path: '/projects/:slug/detected',
      async handle(ctx) {
        sendJson(ctx.res, 200, await refreshDetected(deps, ctx.params['slug'] ?? ''));
      },
    },
  ];
}
