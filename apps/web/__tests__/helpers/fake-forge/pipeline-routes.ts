/**
 * Stub routes for lane pipelines: the company defaults, a project's lists and routing rules, the
 * save-time check, and a ticket's own pipeline and artifacts.
 *
 * Why: pipeline screens are about writes that name a version and refusals the server makes (an
 * unsafe list with its problems, a stale version, nothing to reset). A fixed answer hides all of
 * that, so these routes sit over a world that versions and refuses like the server does. A
 * ticket's pipeline is `null` (not dispatched yet) unless a test stages one with `routes`,
 * which win over these. State lives per call of `pipelineRoutes()`, so each test starts clean.
 *
 * Exports: pipelineRoutes().
 * Depends on: @forge/core, helpers/fetch-stub, helpers/fake-forge/pipeline-world.
 */

import {
  RoutingRule,
  effectivePipelines,
  pipelineProblems,
  routingProblems,
  setProjectRouting,
} from '@forge/core';
import { LIVE, createPipelineWorld } from '#tests/helpers/fake-forge/pipeline-world.js';
import type { WorldOptions } from '#tests/helpers/fake-forge/pipeline-world.js';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';

type Body = Record<string, unknown> | undefined;

export function pipelineRoutes(options: WorldOptions = {}): Routes {
  const {
    roster,
    families,
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
  } = createPipelineWorld(options);

  return {
    'GET /settings/pipelines': () => json(companyBody()),

    'PUT /settings/pipelines/:lane': ({ params, body }) =>
      saveLane('company', params['lane'], body as Body),

    'POST /settings/pipelines/:lane/reset': ({ params, body }) =>
      resetLane('company', params['lane'], body as Body),

    'POST /settings/pipelines/validate': ({ body }) => {
      const b = body as Body;
      const lane = laneOf(String(b?.['lane']));
      const def = parsed(b);

      if (!isLane(lane) || !isDef(def)) {
        return refusal(400, 'invalid_request', 'Bad request.');
      }

      const warnings = effectivePipelines(
        { ...companyLanes(), [lane]: def },
        undefined,
        roster,
        LIVE,
      )[lane].warnings;

      return json({
        problems: pipelineProblems(def, { roster, lane, families_available: families }),
        warnings,
      });
    },

    'GET /settings/projects/:slug/pipelines': ({ params }) =>
      known.has(params['slug']!)
        ? json(projectBody(params['slug']!))
        : refusal(404, 'project_not_found', 'No such project.'),

    'PUT /settings/projects/:slug/pipelines/:lane': ({ params, body }) =>
      saveLane(params['slug']!, params['lane'], body as Body),

    'POST /settings/projects/:slug/pipelines/:lane/reset': ({ params, body }) =>
      resetLane(params['slug']!, params['lane'], body as Body),

    'PUT /settings/projects/:slug/routing': ({ params, body }) => {
      const slug = params['slug']!;
      const b = body as Body;

      if (!known.has(slug)) {
        return refusal(404, 'project_not_found', 'No such project.');
      }

      const refused = stale(b, project(slug).version);

      if (refused) {
        return refused;
      }

      const rules = RoutingRule.array().safeParse(b?.['rules']);

      if (!rules.success) {
        return refusal(400, 'invalid_request', 'The rules are malformed.');
      }

      const problems = routingProblems(rules.data, roster);

      if (problems.length > 0) {
        return invalid('routing_invalid', problems);
      }

      const p = project(slug);

      p.doc = setProjectRouting(p.doc, rules.data);
      p.version += 1;

      return json(projectBody(slug));
    },

    'GET /tickets/:id/pipeline': () => json({ pipeline: null }),

    'GET /tickets/:id/artifacts/:artifactId': ({ params }) =>
      refusal(404, 'artifact_not_found', `No artifact ${params['artifactId']}.`),
  };
}
