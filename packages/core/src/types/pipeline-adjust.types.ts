/**
 * Inputs and result of applying Director ops to a ticket's pipeline copy.
 *
 * Why: the rules that decide whether an op may apply need the roster (roles, scopes, who is usable), which
 *   stage ids a routing rule added (those are the owner's rules, never the Director's to touch) and which
 *   stages already started. Passing them as one plain value keeps the check pure, so the plan step, the first
 *   dispatch, a lane raise and a fallback swap all judge an op the same way.
 *
 * Exports: AdjustContext, AdjustMeta, AdjustResult, AdjustOutcome.
 * Depends on: schemas/pipeline, schemas/pipeline-adjust, types/pipeline-rules. Types only.
 */

import type { AdjustProblem, PipelineAdjustment } from '#/schemas/pipeline-adjust.js';
import type { PipelineDefinition } from '#/schemas/pipeline.js';
import type { PipelineRuleContext } from '#/types/pipeline-rules.types.js';

/** What `applyAdjustments` is told about the world: the rule context plus routed and started stages. */
export interface AdjustContext extends PipelineRuleContext {
  /** Ids of stages a routing rule added (`route-*`): locked. */
  readonly routed: readonly string[];
  /** Ids of top-level stages that are running or already passed in the current cycle: untouchable. */
  readonly frozen?: readonly string[];
}

/** What every log entry of one call carries. `seq` is the number of the first entry (default 0). */
export interface AdjustMeta {
  readonly cause: PipelineAdjustment['cause'];
  readonly at: string;
  readonly seq?: number;
  readonly plan_version?: number;
}

/**
 * The result: `definition` after the ops that applied; `log` has one entry per op in order, `applied` and
 * `dropped` are its two halves, and `problems` has one entry per dropped op, in order.
 */
export interface AdjustResult {
  readonly definition: PipelineDefinition;
  readonly log: PipelineAdjustment[];
  readonly applied: PipelineAdjustment[];
  readonly dropped: PipelineAdjustment[];
  readonly problems: AdjustProblem[];
}

/** What judging one op answers: the list with the op applied, or why it cannot be. */
export type AdjustOutcome = { def: PipelineDefinition } | { problems: AdjustProblem[] };
