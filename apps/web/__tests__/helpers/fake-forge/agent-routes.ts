/**
 * Stub routes for company agents and the agent helpers: templates, harnesses, the tool
 * catalogue, the Director's draft and the test call.
 *
 * Why: agent screens are about writes that name a version (create, edit, reset, archive) and about
 *   refusals the server makes (a stale version, a name already taken, a role bound, the
 *   implementer's lock). A fixed answer hides all of that, so these routes keep the roster in an
 *   `AgentWorld` shared with the project routes, bump the version on every write and answer
 *   with the same codes. State lives per call of `agentRoutes()`, so each test starts clean; a test
 *   stages anything else (a paused harness, a failed probe, a slow draft) with `routes` that win
 *   over these.
 *
 * Exports: agentRoutes().
 * Depends on: @forge/core, helpers/fetch-stub, helpers/fake-forge/{agent-world,agent-project-routes},
 *   helpers/forge-data/agent-data.
 */

import { AGENT_TEMPLATES, BUILTIN_AGENTS } from '@forge/core';
import { projectAgentRoutes } from '#tests/helpers/fake-forge/agent-project-routes.js';
import { createAgentWorld } from '#tests/helpers/fake-forge/agent-world.js';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';
import {
  DRAFT_REPLY,
  SAMPLE_HARNESS,
  TOOL_IDS,
} from '#tests/helpers/forge-data/agent-data.js';

export function agentRoutes(): Routes {
  const w = createAgentWorld();
  const { company } = w;

  return {
    ...projectAgentRoutes(w),

    'GET /settings/agents': () => json(w.companyBody()),

    'POST /settings/agents': ({ body }) => {
      const b = body as Record<string, unknown> | undefined;
      const refused = w.stale(b, company.version);
      if (refused) {
        return refused;
      }

      const def = w.parse(b?.['agent']);
      if (!w.isDef(def)) {
        return def;
      }

      const id = w.idOf(def.name, (c) => c in company.roster);
      if (typeof id !== 'string') {
        return id;
      }

      company.roster[id] = { ...def, origin: String(b?.['origin'] ?? 'custom') };
      w.bumpCompany(b, id, 'created');

      return json(w.companyBody({ id }));
    },

    'PUT /settings/agents/:id': ({ params, body }) => {
      const id = params['id']!;
      const b = body as Record<string, unknown> | undefined;
      const before = company.roster[id];
      if (!before) {
        return w.notFound(id);
      }

      const refused = w.stale(b, company.version);
      if (refused) {
        return refused;
      }

      const def = w.parse(b?.['agent']);
      if (!w.isDef(def)) {
        return def;
      }

      company.roster[id] = { ...def, archived: before.archived, origin: before.origin };
      w.bumpCompany(b, id, 'edited');

      return json(w.companyBody());
    },

    'POST /settings/agents/:id/reset': ({ params, body }) => {
      const id = params['id']!;
      const b = body as Record<string, unknown> | undefined;
      const shipped = BUILTIN_AGENTS[id];
      if (!company.roster[id]) {
        return w.notFound(id);
      }

      if (!shipped) {
        return refusal(409, 'not_builtin', 'Only built-in agents can be reset.');
      }

      const refused = w.stale(b, company.version);
      if (refused) {
        return refused;
      }

      company.roster[id] = structuredClone(shipped);
      w.bumpCompany(b, id, 'reset');

      return json(w.companyBody());
    },

    'POST /settings/agents/:id/:verb': ({ params, body }) => {
      const id = params['id']!;
      const verb = params['verb']!;
      const b = body as Record<string, unknown> | undefined;
      const row = company.roster[id];
      if (verb === 'duplicate') {
        return w.duplicate(undefined, id, b);
      }

      if (!row) {
        return w.notFound(id);
      }

      if (verb === 'archive' && id === 'implementer') {
        return refusal(409, 'agent_required', 'The implementer is required.');
      }

      if (verb === 'archive' && row.origin === 'builtin') {
        return refusal(409, 'builtin_locked', 'Built-in agents cannot be archived.');
      }

      const refused = w.stale(b, company.version);
      if (refused) {
        return refused;
      }

      company.roster[id] = { ...row, archived: verb === 'archive' };
      w.bumpCompany(b, id, verb === 'archive' ? 'archived' : 'unarchived');

      return json(w.companyBody());
    },

    'GET /settings/agents/:id/history': ({ params }) =>
      company.roster[params['id']!]
        ? w.historyOf(`company/${params['id']}`)
        : w.notFound(params['id']!),

    'GET /agents/templates': () =>
      json({
        templates: AGENT_TEMPLATES.map((t) => ({
          id: t.id,
          title: t.title,
          summary: t.summary,
          definition: t.definition,
        })),
      }),

    'GET /agents/runs-on': () => json({ harnesses: [SAMPLE_HARNESS] }),

    'GET /settings/catalogue': () =>
      json({
        version: 1,
        author: 'seed',
        reason: 'seed',
        created_at: 0,
        doc: { entries: TOOL_IDS.map(([id, risk]) => ({ id, risk })) },
      }),

    'POST /agents/draft': ({ body }) => {
      const text = String(
        (body as Record<string, unknown> | undefined)?.['description'] ?? '',
      );

      return text.trim().length < 10
        ? refusal(400, 'invalid_request', 'The description is too short.')
        : json(DRAFT_REPLY);
    },

    'POST /agents/test': () =>
      json({
        ok: true,
        reply:
          'I am a reviewer. My first rule is to read every change before judging it.',
        model_used: 'opus',
        harness_id: 'claude-code',
        duration_ms: 2400,
        cost_usd: 0.0123,
      }),
  };
}
