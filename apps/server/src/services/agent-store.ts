/**
 * The agent store: every read and write of company and project agents.
 *
 * Why: agents live inside the versioned config documents, so each change must land the way the
 *   rules say (a built-in as a diff against what the release ships, a custom agent whole, a
 *   project override as only the fields that differ) and must go through one door that checks
 *   the version the editor saw, validates the result and appends once with author and reason
 *   (code.md rule 6). Routes never write rows: they parse a body and call a method here. The
 *   rules that make an agent safe (a reviewer cannot edit, tools exist in the catalogue, names
 *   are unique, the implementer cannot be disabled or archived while lanes have no other
 *   writer) are enforced here with their own error codes so no screen can route around them.
 *   Agents are archived, never deleted: runs name them.
 *
 * Exports: createAgentStore().
 * Depends on: @forge/core (agent-doc helpers, agentHistory), services/agent-duplicate, services/agent-state,
 *   services/agent-validate, services/http/http-errors, types/agent-store. IO: through the
 *   ConfigSource and catalogue ports.
 */

import {
  addCompanyAgent,
  addProjectAgent,
  agentHistory,
  resetCompanyAgent,
  resetProjectOverride,
  setProjectDisabled,
  storeCompanyAgent,
  storeProjectAgent,
  storeProjectOverride,
} from '@forge/core';
import type {
  AgentDefinition,
  AgentInput,
  CompanyOverride,
  ProjectOverride,
} from '@forge/core';
import { copyAgent } from '#/services/agent-duplicate.js';
import { agentPipelineUse } from '#/services/agent-pipeline-use.js';
import { createAgentState } from '#/services/agent-state.js';
import {
  assertForgeDefault,
  assertFreeName,
  assertKnownTools,
  assertRoleBounds,
  idForName,
} from '#/services/agent-validate.js';
import { HttpError } from '#/services/http/http-errors.js';
import type {
  AgentDeps,
  AgentScope,
  AgentStore,
  ScopeState,
} from '#/types/agent-store.types.js';

const notFound = (id: string): HttpError =>
  new HttpError(404, 'agent_not_found', `no agent ${id}`);

const asCompany = (doc: ScopeState['doc']): CompanyOverride => doc as CompanyOverride;
const asProject = (doc: ScopeState['doc']): ProjectOverride => doc as ProjectOverride;

export function createAgentStore(deps: AgentDeps): AgentStore {
  const state = createAgentState(deps);

  async function toolIds(): Promise<string[]> {
    return (await deps.catalogue.current()).doc.entries.map((e) => e.id);
  }

  /** Everything a saved definition must satisfy: role bounds, known tools, forge_default only on the implementer. */
  async function check(id: string, def: AgentInput): Promise<void> {
    assertRoleBounds(def);
    assertKnownTools(def, await toolIds());
    assertForgeDefault(id, def);
  }

  async function add(
    scope: AgentScope,
    meta: { expected_version: number; reason: string },
    def: AgentInput,
    origin: AgentDefinition['origin'],
  ): Promise<{ id: string; at: ScopeState }> {
    const at = await state.read(scope);
    state.assertFresh(at, meta);
    const id = idForName(def.name);
    assertFreeName(at.views, id, def.name);
    await check(id, def);
    const full: AgentDefinition = { ...def, archived: false, origin };
    const doc =
      scope.scope === 'company'
        ? addCompanyAgent(asCompany(at.doc), id, full)
        : addProjectAgent(asProject(at.doc), id, full);

    return { id, at: await state.commit(at, doc, meta) };
  }

  /** The current stored definition of agent `id` in a scope: the company's, or the project's own. */
  function stored(at: ScopeState, id: string): AgentDefinition {
    const found = at.scope.scope === 'company' ? at.company[id] : at.project?.custom[id];

    if (!found) {
      throw notFound(id);
    }

    return found;
  }

  /** 409 `agent_in_pipeline` (with the lanes and rules that name it) while a pipeline or routing rule uses the agent. */
  async function assertNotInPipeline(
    scope: AgentScope,
    id: string,
    what: 'archived' | 'disabled',
  ): Promise<void> {
    const use = await agentPipelineUse(deps, scope, id);
    if (use.lanes.length === 0 && use.rules.length === 0) {
      return;
    }

    const where = [
      ...(use.lanes.length > 0 ? [`the ${use.lanes.join(', ')} pipeline`] : []),
      ...(use.rules.length > 0 ? [`routing rule ${use.rules.join(', ')}`] : []),
    ].join(' and ');

    throw new HttpError(
      409,
      'agent_in_pipeline',
      `${id} cannot be ${what}: ${where} names it. Change the pipeline or rule first.`,
      { details: { lanes: use.lanes, rules: use.rules } },
    );
  }

  const store: AgentStore = {
    toolIds,

    async list(scope) {
      return (await state.read(scope)).listing;
    },

    async create(scope, body) {
      const { id, at } = await add(scope, body, body.agent, body.origin);

      return { ...at.listing, id };
    },

    async save(scope, id, body) {
      const at = await state.read(scope);
      state.assertFresh(at, body);
      const current = stored(at, id);
      assertFreeName(at.views, id, body.agent.name, id);
      await check(id, body.agent);
      const next: AgentDefinition = {
        ...body.agent,
        archived: current.archived,
        origin: current.origin,
      };

      const doc =
        scope.scope === 'company'
          ? storeCompanyAgent(asCompany(at.doc), id, next)
          : storeProjectAgent(asProject(at.doc), id, next);

      return (await state.commit(at, doc, body)).listing;
    },

    async saveOverride(slug, id, override, body) {
      const at = await state.read({ scope: 'project', slug });
      state.assertFresh(at, body);
      const base = at.company[id];
      if (!base) {
        throw notFound(id);
      }

      const current = at.project?.overrides[id];
      const next = {
        instructions: override.instructions ?? current?.instructions ?? base.instructions,
        runs_on: override.runs_on ?? current?.runs_on ?? base.runs_on,
      };

      await check(id, { ...base, runs_on: next.runs_on });
      const doc = storeProjectOverride(asProject(at.doc), id, next, base);

      return (await state.commit(at, doc, body)).listing;
    },

    async reset(id, body) {
      const at = await state.read({ scope: 'company' });
      state.assertFresh(at, body);
      const current = stored(at, id);
      if (current.origin !== 'builtin') {
        throw new HttpError(409, 'not_builtin', `${id} is not a built-in agent`);
      }

      if (asCompany(at.doc).agents?.[id] === undefined) {
        throw new HttpError(409, 'not_overridden', `${id} has no edits to reset`);
      }

      return (await state.commit(at, resetCompanyAgent(asCompany(at.doc), id), body))
        .listing;
    },

    async resetOverride(slug, id, body) {
      const at = await state.read({ scope: 'project', slug });
      state.assertFresh(at, body);
      if (!at.company[id]) {
        throw notFound(id);
      }

      if (at.project?.overrides[id] === undefined) {
        throw new HttpError(
          409,
          'not_overridden',
          `${id} has no override in this project`,
        );
      }

      const doc = resetProjectOverride(asProject(at.doc), id);

      return (await state.commit(at, doc, body)).listing;
    },

    async archive(scope, id, archived, body) {
      const at = await state.read(scope);
      state.assertFresh(at, body);

      if (scope.scope === 'project' && !at.project?.custom[id]) {
        throw at.company[id]
          ? new HttpError(
              409,
              'builtin_locked',
              'a company agent cannot be archived here; disable it for this project instead',
            )
          : notFound(id);
      }

      const current = stored(at, id);
      if (archived && current.origin === 'builtin') {
        throw new HttpError(
          409,
          'builtin_locked',
          'built-in agents cannot be archived; edit or reset them',
        );
      }

      if (archived) {
        await assertNotInPipeline(scope, id, 'archived');
      }

      if (current.archived === archived) {
        return at.listing;
      }

      const next = { ...current, archived };
      const doc =
        scope.scope === 'company'
          ? storeCompanyAgent(asCompany(at.doc), id, next)
          : storeProjectAgent(asProject(at.doc), id, next);

      return (await state.commit(at, doc, body)).listing;
    },

    async disable(slug, id, disabled, body) {
      const at = await state.read({ scope: 'project', slug });
      state.assertFresh(at, body);
      if (!at.company[id]) {
        throw notFound(id);
      }

      if (disabled) {
        await assertNotInPipeline({ scope: 'project', slug }, id, 'disabled');
      }

      if ((at.project?.disabled.includes(id) ?? false) === disabled) {
        return at.listing;
      }

      const doc = setProjectDisabled(asProject(at.doc), id, disabled);

      return (await state.commit(at, doc, body)).listing;
    },

    duplicate: (from, id, body) => copyAgent(state, add, from, id, body),

    async history(scope, id) {
      const at = await state.read(scope);
      if (!at.views.some((v) => v.id === id)) {
        throw notFound(id);
      }

      const versions =
        scope.scope === 'company'
          ? await deps.config.history('company')
          : await deps.config.history('project', scope.slug);

      return agentHistory(versions, id);
    },
  };

  return store;
}
