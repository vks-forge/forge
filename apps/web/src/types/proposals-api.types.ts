/**
 * The proposals and scorecards resources of the ForgeApi port.
 *
 * Why: the Director's pipeline proposals are read in two places (the Inbox and a project's
 *   Pipelines tab) and decided from both, and scorecards are read on the Agents and Pipelines
 *   tabs. Naming the calls once keeps every path in the http adapter and lets hooks and tests
 *   agree on them. An accept names the project's own settings version so a stale editor is
 *   refused with 409 `version_conflict`; a reject carries the owner's reason.
 *
 * Exports: ProposalFilter, ScorecardQuery, AcceptedProposal, ProposalsApi, ScorecardsApi.
 * Depends on: @forge/core (types only), types/api.types (types only), schemas/pipelines (types).
 */

import type { PipelineProposal, PipelineProposalView, ScorecardReply } from '@forge/core';
import type { z } from 'zod';
import type { ProjectPipelinesReply } from '#/schemas/pipelines.js';
import type { RequestOptions } from '#/types/api.types.js';

export type ProposalFilter = 'pending' | 'all';

export interface ScorecardQuery {
  readonly slug: string;
  readonly range: '30d' | '90d';
  /** Only this agent's card (no shapes). */
  readonly agent?: string | undefined;
}

/** What an accept answers: the decided proposal and the lanes as they are now. */
export interface AcceptedProposal {
  readonly proposal: PipelineProposal;
  readonly pipelines: z.infer<typeof ProjectPipelinesReply>;
}

export interface ProposalsApi {
  list(
    slug: string,
    status: ProposalFilter,
    options?: RequestOptions,
  ): Promise<readonly PipelineProposalView[]>;
  accept(
    slug: string,
    id: number,
    body: { expected_version: number; reason?: string | undefined },
  ): Promise<AcceptedProposal>;
  reject(slug: string, id: number, body: { reason: string }): Promise<PipelineProposal>;
}

export interface ScorecardsApi {
  get(query: ScorecardQuery, options?: RequestOptions): Promise<ScorecardReply>;
}
