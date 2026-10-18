/**
 * Types of the pipeline store: the replies the pipeline routes send and the store's methods.
 *
 * Why: the pipeline routes are thin and the logic lives in one store. The replies are named once
 *   so the routes, the store and the web client's schemas agree on what a write answers: the
 *   fresh effective view of every lane (and, for a project, its routing rules) with the version
 *   the next write must carry.
 *
 * Exports: CompanyPipelinesReply, ProjectLaneView, ProjectPipelinesReply, PipelineCheck, ProposalDoors, PipelineStore.
 * Depends on: @forge/core, schemas/pipeline-api. Types only.
 */

import type {
  AcceptProposalBody,
  Lane,
  PipelineProblem,
  PipelineProposal,
  PipelineProposalView,
  PipelineView,
  RejectProposalBody,
  RoutingRule,
} from '@forge/core';
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

/** The owner's doors on the Director's pipeline proposals: the only writers of a decided proposal. */
export interface ProposalDoors {
  /** A project's proposals, newest first, beside the lane list as it is now; `pending` narrows. 404 `project_not_found`. */
  proposals(slug: string, status: 'pending' | 'all'): Promise<PipelineProposalView[]>;
  /**
   * Accepts a pending proposal through the pipeline save door. 404 `proposal_not_found`; 409 `not_pending`,
   * `proposal_stale` (the lane changed since: the proposal is marked stale and nothing is written),
   * `version_conflict`; 400 `pipeline_invalid` (the roster changed since).
   */
  acceptProposal(
    slug: string,
    id: string,
    body: AcceptProposalBody,
  ): Promise<{ proposal: PipelineProposal; pipelines: ProjectPipelinesReply }>;
  /** Rejects a pending proposal with a reason, for good (the same change on the same base is never proposed again). */
  rejectProposal(
    slug: string,
    id: string,
    body: RejectProposalBody,
  ): Promise<{ proposal: PipelineProposal }>;
}

/** Every pipeline read and write; each write is one `ConfigSource.append` (the one door for pipeline config). */
export interface PipelineStore extends ProposalDoors {
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
