/**
 * Types of the pipeline store: the replies the pipeline routes send and the store's methods.
 *
 * Why: the pipeline routes are thin and the logic lives in one store. The replies are named once
 *   so the routes, the store and the web client's schemas agree on what a write answers: the
 *   fresh effective view of every lane (and, for a project, its routing rules) with the version
 *   the next write must carry.
 *
 * Exports: CompanyPipelinesReply, ProjectLaneView, ProjectPipelinesReply, PipelineCheck, PipelineStore.
 * Depends on: @forge/core, schemas/pipeline-api. Types only.
 */

import type { Lane, PipelineProblem, PipelineView, RoutingRule } from '@forge/core';
import type {
  PipelineResetBody,
  PipelineSaveBody,
  PipelineValidateBody,
  RoutingSaveBody,
} from '#/schemas/pipeline-api.js';

/** What every company pipeline read and write answers. */
export interface CompanyPipelinesReply {
  readonly pipelines: Record<Lane, PipelineView>;
  readonly version: number;
}

/** A lane view in a project: `changed` is true when the project has its own list for the lane. */
export type ProjectLaneView = PipelineView & { readonly changed: boolean };

/** What every project pipeline read and write answers. */
export interface ProjectPipelinesReply {
  readonly pipelines: Record<Lane, ProjectLaneView>;
  readonly routing: RoutingRule[];
  readonly version: { readonly company: number; readonly project: number };
}

/** The answer of the validate door: nothing is written. */
export interface PipelineCheck {
  readonly problems: PipelineProblem[];
  readonly warnings: string[];
}

/** Every pipeline read and write; each write is one `ConfigSource.append` (the one door for pipeline config). */
export interface PipelineStore {
  company(): Promise<CompanyPipelinesReply>;
  saveCompany(lane: string, body: PipelineSaveBody): Promise<CompanyPipelinesReply>;
  resetCompany(lane: string, body: PipelineResetBody): Promise<CompanyPipelinesReply>;
  project(slug: string): Promise<ProjectPipelinesReply>;
  saveProject(
    slug: string,
    lane: string,
    body: PipelineSaveBody,
  ): Promise<ProjectPipelinesReply>;
  resetProject(
    slug: string,
    lane: string,
    body: PipelineResetBody,
  ): Promise<ProjectPipelinesReply>;
  saveRouting(slug: string, body: RoutingSaveBody): Promise<ProjectPipelinesReply>;
  validate(body: PipelineValidateBody): Promise<PipelineCheck>;
}
