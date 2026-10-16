/**
 * Flow cursor — which planning step runs next.
 *
 * Why: a card's flow is an ordered list the runner walks one step per Director call, and it
 *   must resume at the right step after a restart. The cursor is the index of the next step to
 *   consider; this pure function skips the steps that must not run (switched off, or whose
 *   `when` says no for this card) and names the one that does. Where a condition cannot be
 *   decided (the lane is not predicted yet, or the Director has not said), the step runs:
 *   doubt costs process, never safety, the same rule as lane triage.
 *
 * Exports: stepRuns(), resolveFlowStep().
 * Depends on: schemas/director-flow, types/flow-cursor. No IO.
 */

import type { FlowStep } from '#/schemas/director-flow.js';
import type { FlowContext } from '#/types/flow-cursor.types.js';

/** True when `step` should run for this card. */
export function stepRuns(step: FlowStep, ctx: FlowContext): boolean {
  if (!step.enabled) {
    return false;
  }

  if (step.when === 'always') {
    return true;
  }

  if (step.when === 'director_decides') {
    return ctx.decisions[step.id] ?? true;
  }

  return ctx.lane === null || step.when.lanes.includes(ctx.lane);
}

/** The first step at or after `from` that runs, with its index; null when the flow is done. */
export function resolveFlowStep(
  flow: readonly FlowStep[],
  from: number,
  ctx: FlowContext,
): { index: number; step: FlowStep } | null {
  for (let index = Math.max(0, from); index < flow.length; index++) {
    const step = flow[index];
    if (step && stepRuns(step, ctx)) {
      return { index, step };
    }
  }

  return null;
}
