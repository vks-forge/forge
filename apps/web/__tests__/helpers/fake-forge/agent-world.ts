/**
 * The state and rules behind the stubbed agent routes: one company roster, one set of agents per
 * project, versions, refusals.
 *
 * Why: the company routes and the project routes must agree on one roster (a company agent shows
 * under every project, a company edit changes what a project sees), so both are built over one
 * world. It computes lists with core's own `effectiveAgents` (so "edited", "overridden" and
 * "disabled" mean here what they mean on the server), bumps the scope's version on every write,
 * refuses a stale `expected_version` with the server's 409 code, and validates an agent with
 * core's `AgentInput` so a reviewer holding an edit tool is refused the way the server refuses it.
 *
 * Exports: createAgentWorld(), AgentWorld.
 * Depends on: @forge/core, helpers/fetch-stub, helpers/forge-data/agent-data.
 */

import {
  AgentInput,
  BUILTIN_AGENTS,
  effectiveAgents,
  slugifyAgentName,
} from '@forge/core';
import type { AgentDefinition, AgentView, ProjectAgents } from '@forge/core';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { StubResponse } from '#tests/helpers/fetch-stub.js';
import {
  AGENT_PROJECT_VERSION,
  COMPANY_START_VERSION,
} from '#tests/helpers/forge-data/agent-data.js';

type Body = Record<string, unknown> | undefined;

const READY = () => ({ ready: true, reasons: [] as string[] });

const SEED = { author: 'owner', created_at: 1_760_000_000_000 } as const;

export function createAgentWorld() {
  const company = {
    version: COMPANY_START_VERSION,
    roster: structuredClone(BUILTIN_AGENTS) as Record<string, AgentDefinition>,
  };

  const projects = new Map<string, { version: number; agents: ProjectAgents }>();
  const log = new Map<string, { version: number; reason: string; change: string }[]>();

  const project = (slug: string) => {
    const found = projects.get(slug) ?? {
      version: AGENT_PROJECT_VERSION,
      agents: { custom: {}, overrides: {}, disabled: [] } as ProjectAgents,
    };

    projects.set(slug, found);

    return found;
  };

  const companyList = (): AgentView[] =>
    effectiveAgents(company.roster, undefined, READY);

  const projectList = (slug: string): AgentView[] =>
    effectiveAgents(company.roster, project(slug).agents, READY);

  const note = (key: string, version: number, reason: string, change: string): void => {
    log.set(key, [...(log.get(key) ?? []), { version, reason, change }]);
  };

  /** Null when the write may go ahead; otherwise the refusal. */
  const stale = (b: Body, current: number): StubResponse | null => {
    const reason = b?.['reason'];
    if (typeof reason !== 'string' || reason.trim().length < 3) {
      return refusal(
        400,
        'invalid_request',
        'A reason of at least 3 characters is needed.',
      );
    }

    return b?.['expected_version'] === current
      ? null
      : refusal(
          409,
          'version_conflict',
          `The version is ${current}, not ${String(b?.['expected_version'])}.`,
        );
  };

  const parse = (agent: unknown): AgentDefinition | StubResponse => {
    const parsed = AgentInput.safeParse(agent);
    if (!parsed.success) {
      return {
        status: 400,
        body: {
          error: {
            code: 'role_bounds',
            message: 'The agent breaks its role.',
            issues: parsed.error.issues.map((i) => ({
              path: i.path.map(String),
              message: i.message,
            })),
          },
        },
      };
    }

    return { ...parsed.data, archived: false, origin: 'custom' };
  };

  const isDef = (value: AgentDefinition | StubResponse): value is AgentDefinition =>
    'role' in value;

  const idOf = (name: unknown, taken: (id: string) => boolean): string | StubResponse => {
    const id = slugifyAgentName(String(name));
    if (id === null) {
      return refusal(400, 'invalid_name', 'That name cannot become an id.');
    }

    return taken(id) ? refusal(409, 'name_taken', `Agent ${id} exists.`) : id;
  };

  const companyBody = (extra: Record<string, unknown> = {}) => ({
    agents: companyList(),
    version: company.version,
    ...extra,
  });

  const projectBody = (slug: string, extra: Record<string, unknown> = {}) => ({
    agents: projectList(slug),
    version: { company: company.version, project: project(slug).version },
    ...extra,
  });

  const bumpCompany = (b: Body, id: string, change: string): void => {
    company.version += 1;
    note(`company/${id}`, company.version, String(b?.['reason']), change);
  };

  const bumpProject = (slug: string, b: Body, id: string, change: string): void => {
    project(slug).version += 1;
    note(`${slug}/${id}`, project(slug).version, String(b?.['reason']), change);
  };

  const notFound = (id: string): StubResponse =>
    refusal(404, 'agent_not_found', `No agent ${id}.`);

  const historyOf = (key: string): StubResponse =>
    json({
      versions: [
        { ...SEED, version: 1, reason: 'First version', change: 'created' },
        ...(log.get(key) ?? []).map((h) => ({
          ...SEED,
          ...h,
          created_at: SEED.created_at + h.version * 60_000,
        })),
      ],
    });

  /** A copy of an agent visible from `slug` (or the company when undefined), into the body's target scope. */
  const duplicate = (slug: string | undefined, id: string, b: Body): StubResponse => {
    const source = (slug === undefined ? companyList() : projectList(slug)).find(
      (v) => v.id === id,
    );

    if (!source) {
      return notFound(id);
    }

    const target =
      b?.['scope'] === 'company' ? undefined : String(b?.['project'] ?? slug);

    const refused = stale(
      b,
      target === undefined ? company.version : project(target).version,
    );

    if (refused) {
      return refused;
    }

    const model = source.definition.runs_on.model;
    const copy: AgentDefinition = {
      ...source.definition,
      name: String(b?.['name']),
      archived: false,
      origin: `duplicate:${id}`,
      runs_on:
        model.kind === 'forge_default'
          ? { ...source.definition.runs_on, model: { kind: 'model', id: 'sonnet' } }
          : source.definition.runs_on,
    };

    const next = idOf(copy.name, (c) =>
      target === undefined
        ? c in company.roster
        : c in project(target).agents.custom || c in company.roster,
    );

    if (typeof next !== 'string') {
      return next;
    }

    if (target === undefined) {
      company.roster[next] = copy;
      bumpCompany(b, next, 'created');

      return json({ id: next, agents: companyList(), version: company.version });
    }

    project(target).agents.custom[next] = copy;
    bumpProject(target, b, next, 'created');

    return json({
      id: next,
      agents: projectList(target),
      version: { company: company.version, project: project(target).version },
    });
  };

  return {
    company,
    project,
    companyList,
    projectList,
    companyBody,
    projectBody,
    stale,
    parse,
    isDef,
    idOf,
    bumpCompany,
    bumpProject,
    notFound,
    historyOf,
    duplicate,
  };
}

export type AgentWorld = ReturnType<typeof createAgentWorld>;
