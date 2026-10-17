/**
 * `/settings/agents/*` and `/agents/*`: the company's agents, the gallery, the harness pickers, draft and test.
 *
 * Why: agents are the owner's way to say who does a piece of work and on what (d-0147). The
 *   screens list, create, edit, copy, archive and reset them, ask which harnesses and models
 *   are available, start from a template, ask the Director to draft one from a description and
 *   try one with a single capped call. Every write names the version the editor saw and a
 *   reason, and answers with the fresh list so the client never re-derives tags or hashes.
 *   Routes parse and call; the rules are in the agent store. Agents are archived, never deleted.
 *
 * Exports: agentRoutes().
 * Depends on: @forge/core (AGENT_TEMPLATES), schemas/agent-api, services/agent-services,
 *   services/http/{body,http-errors,respond}, types/routes. IO: through the agent services.
 */

import { AGENT_TEMPLATES } from '@forge/core';
import {
  AgentActionBody,
  AgentCreateBody,
  AgentDraftBody,
  AgentDuplicateBody,
  AgentSaveBody,
  AgentTestBody,
} from '#/schemas/agent-api.js';
import { agentServices } from '#/services/agent-services.js';
import { readJson } from '#/services/http/body.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route, RouteContext } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

const COMPANY = { scope: 'company' } as const;
const idOf = (ctx: RouteContext): string => ctx.params['id'] ?? '';

export function agentRoutes(deps: RouteDeps): Route[] {
  const { store, readiness, test, draft } = agentServices(deps);

  return [
    {
      method: 'GET',
      path: '/settings/agents',
      async handle({ res }) {
        sendJson(res, 200, await store.list(COMPANY));
      },
    },
    {
      method: 'POST',
      path: '/settings/agents',
      async handle(ctx) {
        sendJson(
          ctx.res,
          200,
          await store.create(COMPANY, await readJson(ctx.req, AgentCreateBody)),
        );
      },
    },
    {
      method: 'PUT',
      path: '/settings/agents/:id',
      async handle(ctx) {
        const body = await readJson(ctx.req, AgentSaveBody);
        sendJson(ctx.res, 200, await store.save(COMPANY, idOf(ctx), body));
      },
    },
    {
      method: 'POST',
      path: '/settings/agents/:id/reset',
      async handle(ctx) {
        const body = await readJson(ctx.req, AgentActionBody);
        sendJson(ctx.res, 200, await store.reset(idOf(ctx), body));
      },
    },
    {
      method: 'POST',
      path: '/settings/agents/:id/archive',
      async handle(ctx) {
        const body = await readJson(ctx.req, AgentActionBody);
        sendJson(ctx.res, 200, await store.archive(COMPANY, idOf(ctx), true, body));
      },
    },
    {
      method: 'POST',
      path: '/settings/agents/:id/unarchive',
      async handle(ctx) {
        const body = await readJson(ctx.req, AgentActionBody);
        sendJson(ctx.res, 200, await store.archive(COMPANY, idOf(ctx), false, body));
      },
    },
    {
      method: 'POST',
      path: '/settings/agents/:id/duplicate',
      async handle(ctx) {
        const body = await readJson(ctx.req, AgentDuplicateBody);
        sendJson(ctx.res, 200, await store.duplicate(COMPANY, idOf(ctx), body));
      },
    },
    {
      method: 'GET',
      path: '/settings/agents/:id/history',
      async handle(ctx) {
        sendJson(ctx.res, 200, { versions: await store.history(COMPANY, idOf(ctx)) });
      },
    },
    {
      method: 'GET',
      path: '/agents/templates',
      async handle({ res }) {
        sendJson(res, 200, { templates: AGENT_TEMPLATES });
      },
    },
    {
      method: 'GET',
      path: '/agents/runs-on',
      async handle({ res }) {
        sendJson(res, 200, { harnesses: await readiness.harnesses() });
      },
    },
    {
      method: 'POST',
      path: '/agents/draft',
      async handle(ctx) {
        sendJson(ctx.res, 200, await draft(await readJson(ctx.req, AgentDraftBody)));
      },
    },
    {
      method: 'POST',
      path: '/agents/test',
      async handle(ctx) {
        sendJson(ctx.res, 200, await test(await readJson(ctx.req, AgentTestBody)));
      },
    },
  ];
}
