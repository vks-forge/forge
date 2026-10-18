/**
 * Pipeline proposal schemas — the Director's suggestion to change a project's lane pipeline.
 *
 * Why: when the Director keeps making the same change to ticket pipelines (the same security
 *   reviewer added after G1 on three tickets from two cards), the owner's lane list is probably
 *   out of date. The Director never edits that list (d-0151, d-0019): it records a proposal with
 *   the change, the full list that would result and a few quoted reasons, and the owner accepts
 *   it (through the same save door as any edit) or rejects it with a reason. A proposal belongs to
 *   a project and a lane, not to a ticket, so it blocks nothing and is not an escalation.
 *
 * Exports: PROPOSAL_STATUSES, ProposalStatus, ProposalEvidence, ProposalEvidenceList, PipelineProposal, PipelineProposalView,
 *   AcceptProposalBody, RejectProposalBody (and their types).
 * Depends on: schemas/config-override, schemas/ids, schemas/pipeline, schemas/pipeline-adjust,
 *   schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { ConfigVersionRef } from '#/schemas/config-override.js';
import { CardId, TicketId } from '#/schemas/ids.js';
import { PipelineDefinition } from '#/schemas/pipeline.js';
import { PipelineAdjustOp } from '#/schemas/pipeline-adjust.js';
import { Lane } from '#/schemas/ticket.js';

export const PROPOSAL_STATUSES = ['pending', 'accepted', 'rejected', 'stale'] as const;
export const ProposalStatus = z.enum(PROPOSAL_STATUSES);
export type ProposalStatus = z.infer<typeof ProposalStatus>;

/** One ticket the same change was applied to, with the Director's own reason (quoted). */
export const ProposalEvidence = z.object({
  ticket_id: TicketId,
  card_id: CardId.optional(),
  reason: z.string().min(1).max(500),
});
export type ProposalEvidence = z.infer<typeof ProposalEvidence>;

/** One to three quoted cases. */
export const ProposalEvidenceList = z.array(ProposalEvidence).min(1).max(3);

export const PipelineProposal = z.object({
  id: z.number().int().positive(),
  project: z.string().min(1),
  lane: Lane,
  key: z.string().min(1).max(120),
  /** Hash of the lane list the changes were applied to; a changed list starts a new count. */
  base_hash: z.string().regex(/^[0-9a-f]{64}$/),
  op: PipelineAdjustOp,
  /** The project's current effective list with `op` applied; it passed `pipelineProblems`. */
  proposed: PipelineDefinition,
  evidence: ProposalEvidenceList,
  /** How many tickets the change was applied to when the proposal was made. */
  count: z.number().int().positive(),
  status: ProposalStatus,
  created_at: z.iso.datetime(),
  decided_at: z.iso.datetime().optional(),
  decided_reason: z.string().max(500).optional(),
  config_version: ConfigVersionRef.optional(),
});
export type PipelineProposal = z.infer<typeof PipelineProposal>;

/** What the owner's screens read: the proposal beside the lane list as it is now. */
export const PipelineProposalView = PipelineProposal.extend({
  current: PipelineDefinition,
  /** The lane's current list no longer hashes to `base_hash`: accepting would be refused. */
  stale: z.boolean(),
});
export type PipelineProposalView = z.infer<typeof PipelineProposalView>;

export const AcceptProposalBody = z.object({
  expected_version: z.number().int().nonnegative(),
  reason: z.string().trim().max(500).optional(),
});
export type AcceptProposalBody = z.infer<typeof AcceptProposalBody>;

export const RejectProposalBody = z.object({ reason: z.string().trim().min(3).max(500) });
export type RejectProposalBody = z.infer<typeof RejectProposalBody>;
