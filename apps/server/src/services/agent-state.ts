/**
 * Reads one agent scope and writes the next version of its document.
 *
 * Why: every agent change is the whole next override document appended as one version of the
 *   company or project scope (d-0085). Reading and writing therefore share a few facts: the
 *   roster as the engine will see it, the stored document the edit starts from, and the version
 *   the editor must have seen. A write checks that version first (a stale editor gets 409 and
 *   nothing is computed), validates the merged result against the full config schemas so a
 *   document the engine could not run on is never stored, and appends once with the author and
 *   reason. This is the only code that calls `ConfigSource.append` for agents.
 *
 * Exports: createAgentState().
 * Depends on: @forge/core (config, effectiveAgents, merge), services/agent-readiness,
 *   services/http/http-errors, types/agent-store. IO: reads and appends config versions.
 */

import {
  BUILTIN_CONFIG,
  BUILTIN_FORGE_CONFIG,
  BUILTIN_PROJECT_SETTINGS,
  ConfigVersionConflictError,
  InvalidInputError,
  effectiveAgents,
  mergeCompany,
  mergeConfig,
} from '@forge/core';
import type { CompanyOverride, ProjectOverride } from '@forge/core';
import { createAgentReadiness } from '#/services/agent-readiness.js';
import { HttpError } from '#/services/http/http-errors.js';
import type {
  AgentDeps,
  AgentScope,
  AgentState,
  AgentWriteMeta,
  ScopeState,
} from '#/types/agent-store.types.js';

const AUTHOR = 'owner';
const NO_PROJECT_AGENTS = { custom: {}, overrides: {}, disabled: [] };

export function createAgentState(deps: AgentDeps): AgentState {
  const readiness = createAgentReadiness(deps);

  async function latest(scope: AgentScope) {
    const versions =
      scope.scope === 'company'
        ? await deps.config.history('company')
        : await deps.config.history('project', scope.slug);

    const last = versions.at(-1);

    return {
      doc: (last?.doc ?? {}) as CompanyOverride & ProjectOverride,
      version: last?.version ?? 0,
    };
  }

  async function requireProject(slug: string): Promise<void> {
    const known = await deps.storage.transaction(async (tx) =>
      (await tx.projects.list()).some((p) => p.slug === slug),
    );

    if (!known) {
      throw new HttpError(404, 'project_not_found', `no project ${slug}`);
    }
  }

  async function read(scope: AgentScope): Promise<ScopeState> {
    if (scope.scope === 'company') {
      const [c, stored] = await Promise.all([deps.config.company(), latest(scope)]);
      const lookup = await readiness.lookup(BUILTIN_PROJECT_SETTINGS.default_harness);
      const views = effectiveAgents(c.config.agents, undefined, lookup);

      return {
        scope,
        views,
        listing: { agents: views, version: c.version },
        own: stored.version,
        doc: stored.doc,
        company: c.config.agents,
        project: undefined,
        forge: c.config,
      };
    }

    await requireProject(scope.slug);
    const [p, stored] = await Promise.all([
      deps.config.project(scope.slug),
      latest(scope),
    ]);

    const lookup = await readiness.lookup(p.config.project.default_harness);
    const project = p.config.project.agents ?? NO_PROJECT_AGENTS;
    const views = effectiveAgents(p.config.forge.agents, project, lookup);

    return {
      scope,
      views,
      listing: { agents: views, version: p.version },
      own: stored.version,
      doc: stored.doc,
      company: p.config.forge.agents,
      project,
      forge: p.config.forge,
    };
  }

  /** 409 before any work when the editor saw an older version of the scope. */
  function assertFresh(state: ScopeState, meta: AgentWriteMeta): void {
    if (state.own !== meta.expected_version) {
      throw new HttpError(
        409,
        'version_conflict',
        `these settings changed since you opened them (you saw version ${meta.expected_version}, they are at ${state.own}); reload and try again`,
      );
    }
  }

  /** Validates the merged result, appends it as the next version and reads the scope back. */
  async function commit(
    state: ScopeState,
    doc: CompanyOverride | ProjectOverride,
    meta: AgentWriteMeta,
  ): Promise<ScopeState> {
    const { scope } = state;
    try {
      if (scope.scope === 'company') {
        mergeCompany(BUILTIN_FORGE_CONFIG, doc as CompanyOverride);
        await deps.config.append({
          scope: 'company',
          doc: doc as CompanyOverride,
          author: AUTHOR,
          reason: meta.reason,
          expectedVersion: meta.expected_version,
        });
      } else {
        const company = await latest({ scope: 'company' });
        mergeConfig(BUILTIN_CONFIG, company.doc, doc as ProjectOverride);
        await deps.config.append({
          scope: 'project',
          project: scope.slug,
          doc: doc as ProjectOverride,
          author: AUTHOR,
          reason: meta.reason,
          expectedVersion: meta.expected_version,
        });
      }
    } catch (error) {
      if (error instanceof ConfigVersionConflictError) {
        throw new HttpError(409, 'version_conflict', error.message);
      }

      if (error instanceof InvalidInputError) {
        throw new HttpError(400, 'invalid_agent', error.message);
      }

      throw error;
    }

    return read(scope);
  }

  return { read, commit, assertFresh };
}
