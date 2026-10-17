/**
 * The state and rules behind the stubbed pipeline routes: the saved company and project lists,
 * versions, refusals.
 *
 * Why: the company, project and ticket routes must agree on one world (a company edit changes
 * what a project inherits), so they are built over one. It runs core's own `pipelineProblems`,
 * `routingProblems`, `effectivePipelines` and document helpers (so "edited", "changed" and
 * "reset" mean here what they mean on the server), bumps the scope's version on every write and
 * refuses a stale `expected_version` or an unsafe list with the server's codes.
 *
 * Exports: createPipelineWorld(), PipelineWorld, WorldOptions, LANES, LIVE.
 * Depends on: @forge/core, helpers/fetch-stub.
 */

import {
  BUILTIN_AGENTS,
  BUILTIN_PIPELINES,
  PipelineDefinition,
  RoutingRule,
  effectiveAgents,
  effectivePipelines,
  pipelineProblems,
  projectLaneOverridden,
  resetCompanyLane,
  resetProjectLane,
  setCompanyLane,
  setProjectLane,
  companyLaneOverridden,
} from '@forge/core';
import type {
  AgentView,
  CompanyOverride,
  Lane,
  LanePipelines,
  ProjectOverride,
  ProjectPipelines,
} from '@forge/core';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { StubResponse } from '#tests/helpers/fetch-stub.js';

const READY = () => ({ ready: true, reasons: [] as string[] });

export const LIVE: Lane[] = ['express', 'standard'];
export const LANES: Lane[] = ['express', 'standard', 'full'];

type Body = Record<string, unknown> | undefined;

export interface PipelineWorld {
  readonly company: { version: number; doc: CompanyOverride };
  readonly projects: Map<string, { version: number; doc: ProjectOverride }>;
}

export interface WorldOptions {
  roster?: readonly AgentView[];
  projects?: readonly string[];
  /** Routing rules a project starts with, by slug. */
  routing?: Readonly<Record<string, readonly RoutingRule[]>>;
}

export function createPipelineWorld(options: WorldOptions = {}) {
  const roster =
    options.roster ?? effectiveAgents(structuredClone(BUILTIN_AGENTS), undefined, READY);

  const known = new Set(options.projects ?? ['sample-service', 'sample-web']);
  const world: PipelineWorld = {
    company: { version: 3, doc: {} },
    projects: new Map(),
  };

  const project = (slug: string) => {
    const seed = options.routing?.[slug];
    const found = world.projects.get(slug) ?? {
      version: 5,
      doc: seed ? { pipelines: { routing: [...seed] } } : {},
    };

    world.projects.set(slug, found);

    return found;
  };

  const companyLanes = (): LanePipelines => ({
    ...BUILTIN_PIPELINES,
    ...(world.company.doc.pipelines as Partial<LanePipelines> | undefined),
  });

  const companyBody = () => ({
    pipelines: effectivePipelines(companyLanes(), undefined, roster, LIVE),
    version: world.company.version,
  });

  const projectBody = (slug: string) => {
    const { doc, version } = project(slug);
    const { routing, ...own } = doc.pipelines ?? { routing: [] };
    const views = effectivePipelines(
      companyLanes(),
      { ...own, routing: routing ?? [] } as ProjectPipelines,
      roster,
      LIVE,
    );

    return {
      pipelines: Object.fromEntries(
        LANES.map((lane) => [
          lane,
          { ...views[lane], changed: projectLaneOverridden(doc, lane) },
        ]),
      ),
      routing: routing ?? [],
      version: { company: world.company.version, project: version },
    };
  };

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

  const laneOf = (value: string | undefined): Lane | StubResponse =>
    LANES.find((l) => l === value) ??
    refusal(404, 'lane_unknown', `No lane ${String(value)}.`);

  const isLane = (v: Lane | StubResponse): v is Lane => typeof v === 'string';

  const invalid = (code: string, problems: unknown): StubResponse => ({
    status: 400,
    body: { error: { code, message: 'Not saved.', problems } },
  });

  const parsed = (b: Body): PipelineDefinition | StubResponse => {
    const p = PipelineDefinition.safeParse(b?.['pipeline']);

    return p.success ? p.data : refusal(400, 'invalid_request', 'The list is malformed.');
  };

  const isDef = (v: PipelineDefinition | StubResponse): v is PipelineDefinition =>
    'stages' in v;

  const saveLane = (scope: 'company' | string, laneName: string | undefined, b: Body) => {
    const lane = laneOf(laneName);

    if (!isLane(lane)) {
      return lane;
    }

    if (scope !== 'company' && !known.has(scope)) {
      return refusal(404, 'project_not_found', 'No such project.');
    }

    const current = scope === 'company' ? world.company.version : project(scope).version;
    const refused = stale(b, current);

    if (refused) {
      return refused;
    }

    const def = parsed(b);

    if (!isDef(def)) {
      return def;
    }

    const problems = pipelineProblems(def, { roster, lane });

    if (problems.length > 0) {
      return invalid('pipeline_invalid', problems);
    }

    if (scope === 'company') {
      world.company.doc = setCompanyLane(world.company.doc, lane, def);
      world.company.version += 1;

      return json(companyBody());
    }

    const p = project(scope);

    p.doc = setProjectLane(p.doc, lane, def, companyLanes()[lane]);
    p.version += 1;

    return json(projectBody(scope));
  };

  const resetLane = (
    scope: 'company' | string,
    laneName: string | undefined,
    b: Body,
  ) => {
    const lane = laneOf(laneName);

    if (!isLane(lane)) {
      return lane;
    }

    const company = scope === 'company';
    const refused = stale(b, company ? world.company.version : project(scope).version);

    if (refused) {
      return refused;
    }

    const overridden = company
      ? companyLaneOverridden(world.company.doc, lane)
      : projectLaneOverridden(project(scope).doc, lane);

    if (!overridden) {
      return refusal(409, 'not_overridden', 'The lane follows the default already.');
    }

    if (company) {
      world.company.doc = resetCompanyLane(world.company.doc, lane);
      world.company.version += 1;

      return json(companyBody());
    }

    const p = project(scope);

    p.doc = resetProjectLane(p.doc, lane);
    p.version += 1;

    return json(projectBody(scope));
  };

  return {
    roster,
    known,
    project,
    companyBody,
    projectBody,
    saveLane,
    resetLane,
    stale,
    laneOf,
    isLane,
    isDef,
    parsed,
    invalid,
    companyLanes,
  };
}
