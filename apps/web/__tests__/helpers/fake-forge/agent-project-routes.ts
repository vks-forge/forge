/**
 * Stub routes for a project's agents: its own agents, its overrides of company agents, the
 * switch-off list.
 *
 * Why: a project differs from the company in exactly three ways (its own agents, an override of a
 *   company agent's instructions and harness, a company agent switched off here), and each is a
 *   separate write with its own refusals (`override_fields`, `agent_required`, `not_overridden`).
 *   These routes lay them over the shared `AgentWorld` the way the server does: an override equal to
 *   the company agent is dropped, an override of anything else is refused.
 *
 * Exports: projectAgentRoutes().
 * Depends on: @forge/core (types), helpers/fetch-stub, helpers/fake-forge/agent-world.
 */

import type { AgentDefinition, ProjectAgents } from '@forge/core';
import type { AgentWorld } from '#tests/helpers/fake-forge/agent-world.js';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';

type Body = Record<string, unknown> | undefined;

export function projectAgentRoutes(w: AgentWorld): Routes {
  return {
    'GET /settings/projects/:slug/agents': ({ params }) =>
      json(w.projectBody(params['slug']!)),

    'POST /settings/projects/:slug/agents': ({ params, body }) => {
      const slug = params['slug']!;
      const b = body as Body;
      const refused = w.stale(b, w.project(slug).version);
      if (refused) {
        return refused;
      }

      const def = w.parse(b?.['agent']);
      if (!w.isDef(def)) {
        return def;
      }

      const id = w.idOf(
        def.name,
        (c) => c in w.company.roster || c in w.project(slug).agents.custom,
      );

      if (typeof id !== 'string') {
        return id;
      }

      w.project(slug).agents.custom[id] = {
        ...def,
        origin: String(b?.['origin'] ?? 'custom'),
      };

      w.bumpProject(slug, b, id, 'created');

      return json(w.projectBody(slug, { id }));
    },

    'PUT /settings/projects/:slug/agents/:id': ({ params, body }) => {
      const slug = params['slug']!;
      const id = params['id']!;
      const b = body as Body;
      const own = w.project(slug).agents.custom[id];
      const shared = w.company.roster[id];
      if (!own && !shared) {
        return w.notFound(id);
      }

      const refused = w.stale(b, w.project(slug).version);
      if (refused) {
        return refused;
      }

      if (own) {
        const def = w.parse(b?.['agent']);
        if (!w.isDef(def)) {
          return def;
        }

        w.project(slug).agents.custom[id] = {
          ...def,
          archived: own.archived,
          origin: own.origin,
        };

        w.bumpProject(slug, b, id, 'edited');

        return json(w.projectBody(slug));
      }

      const over = b?.['override'] as
        { instructions?: string; runs_on?: AgentDefinition['runs_on'] } | undefined;

      if (!over || 'agent' in (b ?? {}) || !shared) {
        return refusal(
          400,
          'override_fields',
          'Only instructions and runs_on may differ.',
        );
      }

      const kept: ProjectAgents['overrides'][string] = {};
      if (over.instructions !== undefined && over.instructions !== shared.instructions) {
        kept.instructions = over.instructions;
      }

      if (
        over.runs_on !== undefined &&
        JSON.stringify(over.runs_on) !== JSON.stringify(shared.runs_on)
      ) {
        kept.runs_on = over.runs_on;
      }

      if (Object.keys(kept).length === 0) {
        delete w.project(slug).agents.overrides[id];
      } else {
        w.project(slug).agents.overrides[id] = kept;
      }

      w.bumpProject(slug, b, id, 'edited');

      return json(w.projectBody(slug));
    },

    'POST /settings/projects/:slug/agents/:id/:verb': ({ params, body }) => {
      const slug = params['slug']!;
      const id = params['id']!;
      const verb = params['verb']!;
      const b = body as Body;
      const p = w.project(slug);
      if (verb === 'duplicate') {
        return w.duplicate(slug, id, b);
      }

      const own = p.agents.custom[id];
      if (!own && !w.company.roster[id]) {
        return w.notFound(id);
      }

      if (verb === 'disable' && id === 'implementer') {
        return refusal(409, 'agent_required', 'The implementer is required.');
      }

      if (verb === 'reset-override' && !p.agents.overrides[id]) {
        return refusal(409, 'not_overridden', 'Nothing is overridden.');
      }

      const refused = w.stale(b, p.version);
      if (refused) {
        return refused;
      }

      if (verb === 'reset-override') {
        delete p.agents.overrides[id];
        w.bumpProject(slug, b, id, 'reset');
      } else if (verb === 'disable' || verb === 'enable') {
        p.agents.disabled = p.agents.disabled.filter((d) => d !== id);
        if (verb === 'disable') {
          p.agents.disabled.push(id);
        }

        w.bumpProject(slug, b, id, verb === 'disable' ? 'disabled' : 'enabled');
      } else if (own) {
        p.agents.custom[id] = { ...own, archived: verb === 'archive' };
        w.bumpProject(slug, b, id, verb === 'archive' ? 'archived' : 'unarchived');
      } else {
        return refusal(409, 'builtin_locked', 'Use disable for a company agent.');
      }

      return json(w.projectBody(slug));
    },

    'GET /settings/projects/:slug/agents/:id/history': ({ params }) =>
      w.historyOf(`${params['slug']}/${params['id']}`),
  };
}
