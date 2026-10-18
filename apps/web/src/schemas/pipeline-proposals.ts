/**
 * The pipeline proposal and scorecard shapes the web reads, and the reply schemas of their routes.
 *
 * Why: the Director proposes a change to a project's lane after it made the same change on several
 *   tickets, and the owner accepts or rejects it; the same data is read by the Inbox and the
 *   Pipelines tab, so both must parse one shape. Scorecards come from the server computed on read.
 *   Both shapes belong to `@forge/core`; this file re-exports them under the web's `#/schemas`
 *   path and adds how each route's answer is parsed.
 *
 * Exports: PipelineProposalView, PipelineProposal, ProposalsReply, AcceptProposalReply,
 *   RejectProposalReply, ScorecardReply, ScorecardRow, AgentScorecard, ShapeScorecard,
 *   MIN_SCORECARD_TICKETS, FindingVerdict.
 * Depends on: @forge/core, schemas/pipelines, zod.
 */

import {
  AgentScorecard,
  FindingVerdict,
  MIN_SCORECARD_TICKETS,
  PipelineProposal,
  PipelineProposalView,
  ScorecardReply,
  ScorecardRow,
  ShapeScorecard,
} from '@forge/core';
import { z } from 'zod';
import { ProjectPipelinesReply } from '#/schemas/pipelines.js';

export {
  AgentScorecard,
  FindingVerdict,
  MIN_SCORECARD_TICKETS,
  PipelineProposal,
  PipelineProposalView,
  ScorecardReply,
  ScorecardRow,
  ShapeScorecard,
};

/** `GET /settings/projects/:slug/pipeline-proposals`. */
export const ProposalsReply = z.object({ proposals: z.array(PipelineProposalView) });

/** `POST .../accept`: the decided proposal and the lanes as they are now. */
export const AcceptProposalReply = z.object({
  proposal: PipelineProposal,
  pipelines: ProjectPipelinesReply,
});

/** `POST .../reject`. */
export const RejectProposalReply = z.object({ proposal: PipelineProposal });
