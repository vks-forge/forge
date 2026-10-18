/**
 * Sample Director pipeline proposals and scorecards, in the shapes the S5d server sends.
 *
 * Why: the proposal banner, the Inbox review drawer and the scorecard panels each have states that
 * matter (a lane diff with an addition, a removal, a stale proposal; a row with too few tickets, a
 * row with no cost recorded), and every test must build exactly the one it pins without restating
 * a lane or a scorecard. The lanes come from core's own built-ins so the fixtures cannot drift
 * from what the product ships.
 *
 * Exports: proposalView(), addReviewerProposal(), removeReviewProposal(), scorecardRow(),
 *   scorecardReply(), SECURITY_STAGE, PROPOSAL_ROUTE.
 * Depends on: @forge/core.
 */

import { BUILTIN_PIPELINES, CardId, TicketId } from '@forge/core';
import type {
  AgentStage,
  PipelineDefinition,
  PipelineProposalView,
  ScorecardReply,
  ScorecardRow,
} from '@forge/core';

export const PROPOSAL_ROUTE = 'GET /settings/projects/:slug/pipeline-proposals';

export const SECURITY_STAGE: AgentStage = {
  id: 'dir-security',
  kind: 'agent',
  label: 'Security review',
  agent: 'reviewer',
};

const HASH = 'b'.repeat(64);

/** The standard lane with `stage` inserted after `after`. */
function withStage(after: string, stage: AgentStage): PipelineDefinition {
  const base = structuredClone(BUILTIN_PIPELINES.standard);
  const at = base.stages.findIndex((s) => s.id === after);

  base.stages.splice(at + 1, 0, stage);

  return base;
}

export function proposalView(
  over: Partial<PipelineProposalView> = {},
): PipelineProposalView {
  return {
    id: 12,
    project: 'sample-service',
    lane: 'standard',
    key: 'standard:add:dir-security@after:g1',
    base_hash: HASH,
    op: {
      op: 'add',
      stage: SECURITY_STAGE,
      after: 'g1',
      reason: 'Touches the login code, so a security look is worth it.',
    },
    proposed: withStage('g1', SECURITY_STAGE),
    current: structuredClone(BUILTIN_PIPELINES.standard),
    evidence: [
      {
        ticket_id: TicketId.parse('SVC-1'),
        card_id: CardId.parse('FG-C1'),
        reason: 'It edits the login handler.',
      },
      {
        ticket_id: TicketId.parse('SVC-2'),
        card_id: CardId.parse('FG-C2'),
        reason: 'It changes a token check.',
      },
      {
        ticket_id: TicketId.parse('SVC-3'),
        card_id: CardId.parse('FG-C2'),
        reason: 'It adds a permissions file.',
      },
    ],
    count: 3,
    status: 'pending',
    stale: false,
    created_at: '2026-10-17T10:00:00.000Z',
    ...over,
  };
}

/** The common one: "add a Security review after g1 on Standard". */
export const addReviewerProposal = (
  over: Partial<PipelineProposalView> = {},
): PipelineProposalView => proposalView(over);

/** A proposal that takes the reviewer away: a lighter lane. */
export function removeReviewProposal(): PipelineProposalView {
  const proposed = structuredClone(BUILTIN_PIPELINES.standard);

  proposed.stages = proposed.stages.filter((s) => s.id !== 'reviewer');

  return proposalView({
    id: 13,
    key: 'standard:remove:reviewer',
    op: {
      op: 'remove',
      stage_id: 'reviewer',
      reason: 'Small text changes need no review.',
    },
    proposed,
  });
}

export function scorecardRow(over: Partial<ScorecardRow> = {}): ScorecardRow {
  return {
    by: 'all',
    tickets: 12,
    runs: 20,
    insufficient: false,
    clean_rate: { hits: 9, total: 12, rate: 0.75 },
    pass_rate: null,
    reworks_per_ticket: 0.4,
    holds: 1,
    overrides: 0,
    cost: {
      total_usd: 5.04,
      per_ticket_usd: 0.42,
      coverage: { hits: 18, total: 20, rate: 0.9 },
    },
    duration: { count: 20, median_ms: 250_000, p90_ms: 720_000 },
    fallback_runs: 0,
    substituted: 0,
    ...over,
  };
}

export function scorecardReply(over: Partial<ScorecardReply> = {}): ScorecardReply {
  return {
    range: '90d',
    agents: [
      {
        agent_id: 'implementer',
        name: 'Implementer',
        role: 'writer',
        rows: [scorecardRow()],
      },
    ],
    shapes: [],
    computed_at: '2026-10-18T09:00:00.000Z',
    ...over,
  };
}
