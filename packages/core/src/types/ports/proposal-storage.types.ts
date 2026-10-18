/**
 * Proposal storage ports — pipeline proposals and the owner's marks on findings.
 *
 * Why: the Director's suggestion to change a project's lane is a row of its own (it belongs to a project
 *   and a lane, not to a ticket, so it blocks nothing and is not an escalation), and its unique key keeps
 *   a decided change from ever being proposed again for the same base list. The owner's "Real" or "False
 *   alarm" on a finding is the one direct judgement scorecards have, stored by (stage row, finding index).
 *   Both join the same transaction as tickets and stage rows, so a proposal is written together with the
 *   snapshot that triggered it and a mark together with the live-update announcement.
 *
 * Exports: PipelineProposalRepository, FindingMarkRepository, NewPipelineProposal, ProposalDecisionPatch.
 * Depends on: schemas/config-override, schemas/pipeline-proposal, schemas/scorecard, schemas/ticket. Types only.
 */

import type { ConfigVersionRef } from '#/schemas/config-override.js';
import type { PipelineProposal, ProposalStatus } from '#/schemas/pipeline-proposal.js';
import type { FindingMark } from '#/schemas/scorecard.js';

/** What a new proposal carries; storage assigns the id and starts it `pending`. */
export type NewPipelineProposal = Omit<
  PipelineProposal,
  'id' | 'status' | 'decided_at' | 'decided_reason' | 'config_version'
>;

/** What a decision records. */
export interface ProposalDecisionPatch {
  readonly status: Exclude<ProposalStatus, 'pending'>;
  readonly reason?: string;
  readonly config_version?: ConfigVersionRef;
  readonly at: string;
}

export interface PipelineProposalRepository {
  /** The new row's id, or `'exists'` when (project, lane, key, base_hash) already has one in any status. */
  insert(proposal: NewPipelineProposal): Promise<number | 'exists'>;
  get(id: number): Promise<PipelineProposal | null>;
  /** A project's proposals, newest first; `status` narrows. */
  list(project: string, status?: ProposalStatus): Promise<PipelineProposal[]>;
  /** pending to a decision, compare-and-swap: false when it is unknown or no longer pending. */
  decide(id: number, patch: ProposalDecisionPatch): Promise<boolean>;
}

export interface FindingMarkRepository {
  /** Records the owner's verdict on one finding; a second mark replaces the first. */
  set(mark: FindingMark & { readonly ticket_id: string }): Promise<void>;
  /** Removes the mark; false when there was none. */
  clear(stageRunId: number, findingIndex: number): Promise<boolean>;
  listByStageRuns(stageRunIds: readonly number[]): Promise<FindingMark[]>;
  /** Marks on any stage row of up to 500 tickets (scorecards). */
  listByTickets(ticketIds: readonly string[]): Promise<FindingMark[]>;
}
