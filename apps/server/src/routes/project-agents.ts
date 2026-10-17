/**
 * `/settings/projects/:slug/agents/*`: a project's effective agents, its own agents and its overrides.
 *
 * Why: a project may add agents of its own, switch a company agent off, and override two things
 *   on a company agent, its instructions and where it runs (d-0149); nothing else may differ per
 *   project, so a body that names other fields is refused with `override_fields` rather than
 *   quietly dropped. Saving a company agent here stores an override, never a copy. The project
 *   in the path must exist (404 `project_not_found`), and every write names the project version
 *   the editor saw and a reason, as the company routes do.
 *
 * Exports: projectAgentRoutes().
 * Depends on: schemas/agent-api, services/agent-services, services/http/{body,http-errors,respond},
 *   types/routes. IO: through the agent services.
 */

import {
  AgentActionBody,
  AgentCreateBody,
  AgentDuplicateBody,
  AgentOverride,
  OVERRIDE_KEYS,
  ProjectAgentSaveBody,
} from '#/schemas/agent-api.js';
import { agentServices } from '#/services/agent-services.js';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route, RouteContext } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

const slugOf = (ctx: RouteContext): { scope: 'project'; slug: string } => ({
  scope: 'project',
  slug: ctx.params['slug'] ?? '',
});

const idOf = (ctx: RouteContext): string => ctx.params['id'] ?? '';

export function projectAgentRoutes(deps: RouteDeps): Route[] {
  const { store } = agentServices(deps);
  const action = (
    suffix: string,
    run: (ctx: RouteContext, body: AgentActionBody) => ReturnType<typeof store.list>,
  ): Route => ({
    method: 'POST',
    path: `/settings/projects/:slug/agents/:id/${suffix}`,
    async handle(ctx) {
      sendJson(ctx.res, 200, await run(ctx, await readJson(ctx.req, AgentActionBody)));
    },
  });

  return [
    {
      method: 'GET',
      path: '/settings/projects/:slug/agents',
      async handle(ctx) {
        sendJson(ctx.res, 200, await store.list(slugOf(ctx)));
      },
    },
    {
      method: 'POST',
      path: '/settings/projects/:slug/agents',
      async handle(ctx) {
        const body = await readJson(ctx.req, AgentCreateBody);
        sendJson(ctx.res, 200, await store.create(slugOf(ctx), body));
      },
    },
    {
      method: 'PUT',
      path: '/settings/projects/:slug/agents/:id',
      async handle(ctx) {
        const body = await readJson(ctx.req, ProjectAgentSaveBody);
        const scope = slugOf(ctx);
        const meta = { expected_version: body.expected_version, reason: body.reason };

        // A project agent is saved whole; a company agent only takes an override.
        const listing = await store.list(scope);
        const own = listing.agents.find((a) => a.id === idOf(ctx));
        if (own?.scope === 'project') {
          if (body.agent === undefined) {
            throw new HttpError(400, 'invalid_request', 'send the agent to save', {
              issues: [{ path: 'agent', message: 'required for a project agent' }],
            });
          }

          sendJson(
            ctx.res,
            200,
            await store.save(scope, idOf(ctx), { agent: body.agent, ...meta }),
          );

          return;
        }

        const keys = Object.keys(body.override ?? {});
        const extra = keys.filter(
          (k) => !(OVERRIDE_KEYS as readonly string[]).includes(k),
        );

        if (body.override === undefined || body.agent !== undefined || extra.length > 0) {
          throw new HttpError(
            400,
            'override_fields',
            'a company agent can only be overridden here: send { override: { instructions?, runs_on? } }',
            {
              issues: [
                ...extra.map((k) => ({
                  path: `override.${k}`,
                  message: 'not overridable per project',
                })),
                ...(body.agent === undefined
                  ? []
                  : [
                      {
                        path: 'agent',
                        message: 'send override, not agent, for a company agent',
                      },
                    ]),
              ],
            },
          );
        }

        const parsed = AgentOverride.safeParse(body.override);
        if (!parsed.success) {
          throw HttpError.fromZod(parsed.error);
        }

        sendJson(
          ctx.res,
          200,
          await store.saveOverride(scope.slug, idOf(ctx), parsed.data, meta),
        );
      },
    },
    action('reset-override', (ctx, body) =>
      store.resetOverride(slugOf(ctx).slug, idOf(ctx), body),
    ),
    action('disable', (ctx, body) =>
      store.disable(slugOf(ctx).slug, idOf(ctx), true, body),
    ),
    action('enable', (ctx, body) =>
      store.disable(slugOf(ctx).slug, idOf(ctx), false, body),
    ),
    action('archive', (ctx, body) => store.archive(slugOf(ctx), idOf(ctx), true, body)),
    action('unarchive', (ctx, body) =>
      store.archive(slugOf(ctx), idOf(ctx), false, body),
    ),
    {
      method: 'POST',
      path: '/settings/projects/:slug/agents/:id/duplicate',
      async handle(ctx) {
        const body = await readJson(ctx.req, AgentDuplicateBody);
        sendJson(ctx.res, 200, await store.duplicate(slugOf(ctx), idOf(ctx), body));
      },
    },
    {
      method: 'GET',
      path: '/settings/projects/:slug/agents/:id/history',
      async handle(ctx) {
        sendJson(ctx.res, 200, { versions: await store.history(slugOf(ctx), idOf(ctx)) });
      },
    },
  ];
}
