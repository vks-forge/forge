/**
 * The pipeline store: every read and write of company and project lane pipelines and routing.
 *
 * Why: lane pipelines live inside the versioned config documents (d-0151, d-0085), so each change
 *   must land the way the rules say (a lane's list replaces the whole lane, a list equal to what
 *   the lane would be anyway is not stored, Reset removes the key) and go through one door that
 *   checks the version the editor saw, judges the list against the roster of the scope it will
 *   run in and appends once with author and reason (code.md rule 6). Routes never write rows:
 *   they parse a body and call a method here. The safety rules (`pipelineProblems`,
 *   `routingProblems`) run BEFORE anything is appended and answer 400 with every problem, so a
 *   pipeline that skips G1 or lets an agent check its own work can never be stored, whoever
 *   sends it, and a critic on the Worker's own model family is a problem once two families are
 *   connected (services/model-families). The engine runs the same rules again when a ticket takes
 *   its snapshot.
 *
 * Exports: createPipelineStore().
 * Depends on: @forge/core (pipeline rules, doc helpers, effectivePipelines), @forge/engine (LIVE_LANES),
 *   services/{agent-state,model-families}, services/http/http-errors, types/pipeline-store. IO: through the
 *   ConfigSource port.
 */

import {
  Lane,
  companyLaneOverridden,
  effectivePipelines,
  pipelineProblems,
  projectLaneOverridden,
  resetCompanyLane,
  resetProjectLane,
  routingProblems,
  setCompanyLane,
  setProjectLane,
  setProjectRouting,
} from '@forge/core';
import type {
  CompanyOverride,
  PipelineDefinition,
  PipelineProblem,
  ProjectOverride,
  ProjectPipelines,
} from '@forge/core';
import { LIVE_LANES } from '@forge/engine';
import { createAgentState } from '#/services/agent-state.js';
import { HttpError } from '#/services/http/http-errors.js';
import { connectedFamilies } from '#/services/model-families.js';
import type { AgentDeps, ScopeState } from '#/types/agent-store.types.js';
import type {
  CompanyPipelinesReply,
  PipelineStore,
  ProjectPipelinesReply,
} from '#/types/pipeline-store.types.js';

const COMPANY = { scope: 'company' } as const;
const EMPTY: ProjectPipelines = { routing: [] };

/** 404 `lane_unknown` unless `raw` is express, standard or full. */
function laneOf(raw: string): Lane {
  const lane = Lane.safeParse(raw);
  if (!lane.success) {
    throw new HttpError(404, 'lane_unknown', `no lane ${raw}`);
  }

  return lane.data;
}

function refuse(
  code: 'pipeline_invalid' | 'routing_invalid',
  problems: PipelineProblem[],
): never {
  const first = problems[0]?.message ?? 'the list is not valid';

  throw new HttpError(
    400,
    code,
    `${first}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''}`,
    {
      details: { problems },
    },
  );
}

export function createPipelineStore(deps: AgentDeps): PipelineStore {
  const state = createAgentState(deps);

  const companyReply = (at: ScopeState): CompanyPipelinesReply => ({
    pipelines: effectivePipelines(at.forge.pipelines, undefined, at.views, LIVE_LANES),
    version: at.listing.version as number,
  });

  /** The project's own pipelines as the engine will read them (settings merge, defaults applied). */
  async function ownPipelines(slug: string): Promise<ProjectPipelines> {
    return (await deps.config.project(slug)).config.project.pipelines ?? EMPTY;
  }

  async function projectReply(
    at: ScopeState,
    slug: string,
  ): Promise<ProjectPipelinesReply> {
    const own = await ownPipelines(slug);
    const views = effectivePipelines(at.forge.pipelines, own, at.views, LIVE_LANES);
    const pipelines = Object.fromEntries(
      Object.values(views).map((v) => [
        v.lane,
        { ...v, changed: own[v.lane] !== undefined },
      ]),
    ) as ProjectPipelinesReply['pipelines'];

    return {
      pipelines,
      routing: own.routing,
      version: at.listing.version as ProjectPipelinesReply['version'],
    };
  }

  const asCompany = (doc: ScopeState['doc']): CompanyOverride => doc as CompanyOverride;
  const asProject = (doc: ScopeState['doc']): ProjectOverride => doc as ProjectOverride;

  async function judge(
    at: ScopeState,
    lane: Lane,
    def: PipelineDefinition,
  ): Promise<void> {
    const problems = pipelineProblems(def, {
      roster: at.views,
      lane,
      families_available: await connectedFamilies(deps),
    });

    if (problems.length > 0) {
      refuse('pipeline_invalid', problems);
    }
  }

  return {
    async company() {
      return companyReply(await state.read(COMPANY));
    },

    async saveCompany(rawLane, body) {
      const lane = laneOf(rawLane);
      const at = await state.read(COMPANY);
      state.assertFresh(at, body);
      await judge(at, lane, body.pipeline);
      const doc = setCompanyLane(asCompany(at.doc), lane, body.pipeline);

      return companyReply(await state.commit(at, doc, body));
    },

    async resetCompany(rawLane, body) {
      const lane = laneOf(rawLane);
      const at = await state.read(COMPANY);
      state.assertFresh(at, body);
      if (!companyLaneOverridden(asCompany(at.doc), lane)) {
        throw new HttpError(
          409,
          'not_overridden',
          `the ${lane} lane has no edits to reset`,
        );
      }

      return companyReply(
        await state.commit(at, resetCompanyLane(asCompany(at.doc), lane), body),
      );
    },

    async project(slug) {
      return projectReply(await state.read({ scope: 'project', slug }), slug);
    },

    async saveProject(slug, rawLane, body) {
      const lane = laneOf(rawLane);
      const at = await state.read({ scope: 'project', slug });
      state.assertFresh(at, body);
      await judge(at, lane, body.pipeline);
      const doc = setProjectLane(
        asProject(at.doc),
        lane,
        body.pipeline,
        at.forge.pipelines[lane],
      );

      return projectReply(await state.commit(at, doc, body), slug);
    },

    async resetProject(slug, rawLane, body) {
      const lane = laneOf(rawLane);
      const at = await state.read({ scope: 'project', slug });
      state.assertFresh(at, body);
      if (!projectLaneOverridden(asProject(at.doc), lane)) {
        throw new HttpError(
          409,
          'not_overridden',
          `the ${lane} lane has no override in this project`,
        );
      }

      return projectReply(
        await state.commit(at, resetProjectLane(asProject(at.doc), lane), body),
        slug,
      );
    },

    async saveRouting(slug, body) {
      const at = await state.read({ scope: 'project', slug });
      state.assertFresh(at, body);
      const problems = routingProblems(body.rules, at.views);
      if (problems.length > 0) {
        refuse('routing_invalid', problems);
      }

      const doc = setProjectRouting(asProject(at.doc), body.rules);

      return projectReply(await state.commit(at, doc, body), slug);
    },

    async validate(body) {
      const at = await state.read(
        body.project === undefined ? COMPANY : { scope: 'project', slug: body.project },
      );

      const company = { ...at.forge.pipelines, [body.lane]: body.pipeline };
      const view = effectivePipelines(company, undefined, at.views, LIVE_LANES)[
        body.lane
      ];

      return {
        problems: pipelineProblems(body.pipeline, {
          roster: at.views,
          lane: body.lane,
          families_available: await connectedFamilies(deps),
        }),
        warnings: view.warnings,
      };
    },
  };
}
