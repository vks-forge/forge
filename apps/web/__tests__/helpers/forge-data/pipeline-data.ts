/**
 * Sample ticket pipelines for the strip and review tests.
 *
 * Why: the strip has many states that matter (a running stage, a failed check with findings, a
 * ticket in its second round, a held ticket, a stage a rule added), and each test must build
 * exactly the one it pins without restating a whole ticket pipeline. `stageView()` fills a stage
 * with sane defaults and `ticketPipeline()` wraps stages with the lane, rework count and routed
 * list, so a test reads as the sentence it proves.
 *
 * Exports: stageView(), ticketPipeline(), STANDARD_STAGES.
 * Depends on: @forge/core (types).
 */

import type { StageView, TicketPipelineView } from '@forge/core';

export function stageView(
  id: string,
  over: Partial<StageView> & { label?: string } = {},
): StageView {
  return {
    id,
    kind: 'agent',
    label: over.label ?? id,
    status: 'pending',
    cycle: 0,
    warnings: [],
    artifacts: [],
    ...over,
  };
}

/** Standard lane, nothing run yet. */
export const STANDARD_STAGES: StageView[] = [
  stageView('test-writer', {
    label: 'Write failing tests',
    agent: { id: 'test-writer', name: 'Test writer' },
  }),
  stageView('implementer', {
    label: 'Implement',
    agent: { id: 'implementer', name: 'Implementer' },
  }),
  stageView('g1', { label: 'Gate G1', kind: 'script_gate' }),
  stageView('reviewer', { label: 'Review', agent: { id: 'reviewer', name: 'Reviewer' } }),
  stageView('merge', { label: 'Merge', kind: 'merge' }),
];

export function ticketPipeline(
  stages: StageView[],
  over: Partial<TicketPipelineView> = {},
): TicketPipelineView {
  return {
    lane: 'standard',
    hash: 'a'.repeat(64),
    config_version: 'c1:p0',
    stages,
    routed: [],
    adjustments: [],
    removed: [],
    base_hash: 'a'.repeat(64),
    rework: { count: 0, cap: 2 },
    ...over,
  };
}
