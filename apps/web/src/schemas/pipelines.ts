/**
 * The pipeline shapes the web reads and the reply schemas of the pipeline routes.
 *
 * Why: a lane's pipeline is defined once, in `@forge/core`, with the rules that make it safe to
 *   run; the editor must show the very same problems the server will refuse a save for, and a
 *   ticket's strip must read the very same stage rows the engine wrote. This file re-exports
 *   those core shapes under one roof and adds what only the web needs: how each route's answer is
 *   parsed. A company answer carries one version number; a project answer carries a pair and
 *   marks each lane `changed` when the project has its own list, which is what "Reset" and the
 *   "Changed from company default" note are driven by.
 *
 * Exports: PipelineDefinition, PipelineProblem, PipelineView, RoutingRule, Stage, StageArtifact,
 *   TicketPipelineView, StageView (type), CompanyPipelinesReply, ProjectPipelinesReply, ValidateReply,
 *   TicketPipelineReply, PROBLEM_CODES.
 * Depends on: @forge/core, zod.
 */

import {
  PIPELINE_PROBLEM_CODES,
  PipelineDefinition,
  PipelineProblem,
  PipelineView,
  RoutingRule,
  Stage,
  StageArtifact,
  TicketPipelineView,
} from '@forge/core';
import { z } from 'zod';

export {
  PipelineDefinition,
  PipelineProblem,
  PipelineView,
  RoutingRule,
  Stage,
  StageArtifact,
  TicketPipelineView,
};

export type { StageView } from '@forge/core';

export const PROBLEM_CODES = PIPELINE_PROBLEM_CODES;

const Version = z.number().int().nonnegative();
const ProjectVersion = z.object({ company: Version, project: Version });

const CompanyLanes = z.object({
  express: PipelineView,
  standard: PipelineView,
  full: PipelineView,
});

const ProjectView = PipelineView.extend({ changed: z.boolean() });
const ProjectLanes = z.object({
  express: ProjectView,
  standard: ProjectView,
  full: ProjectView,
});

/** `GET /settings/pipelines` and every company write. */
export const CompanyPipelinesReply = z.object({
  pipelines: CompanyLanes,
  version: Version,
});

/** `GET /settings/projects/:slug/pipelines` and every project write. */
export const ProjectPipelinesReply = z.object({
  pipelines: ProjectLanes,
  routing: z.array(RoutingRule),
  version: ProjectVersion,
});

/** `POST /settings/pipelines/validate`. */
export const ValidateReply = z.object({
  problems: z.array(PipelineProblem),
  warnings: z.array(z.string()),
});

/** `GET /tickets/:id/pipeline`: `null` until the ticket's first dispatch. */
export const TicketPipelineReply = z.object({ pipeline: TicketPipelineView.nullable() });
