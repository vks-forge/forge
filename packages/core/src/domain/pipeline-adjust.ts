/**
 * Pipeline adjustments — applying the Director's changes to one ticket's own pipeline copy.
 *
 * Why: the Director may tailor a ticket's pipeline (a security reviewer on auth code, a lighter list for
 *   a tiny change, a substitute agent when the first cannot run), but only what an LLM agent does. A
 *   deterministic check, a person's step and the owner's rules are never its to change (d-0149, d-0151):
 *   merge, G1, every script gate, human and sign-off stages and stages a routing rule added are locked,
 *   and so is any stage that already started. This is the one place that says so. Each op is judged on
 *   its own against the list as the earlier ops left it; an op that breaks a lock, names something that is
 *   not there, changes a role, widens a writer's scope or leaves a list that fails `pipelineProblems` is
 *   dropped with a reason and the rest stand, so one bad op never costs the owner their pipeline. Added
 *   stages can never carry a command (a group with a script gate is refused: that would be the model
 *   inventing something to run).
 *
 * Exports: applyAdjustments(), adjustProblems(), isLockedStage().
 * Depends on: domain/{adjustment-key,pipeline-adjust-kit,pipeline-adjust-ops}, schemas/pipeline, schemas/pipeline-adjust,
 *   types/pipeline-adjust. No IO.
 */

import { adjustmentKey } from '#/domain/adjustment-key.js';
import { isLockedStage } from '#/domain/pipeline-adjust-kit.js';
import { applyOp } from '#/domain/pipeline-adjust-ops.js';
import type {
  AdjustProblem,
  PipelineAdjustOp,
  PipelineAdjustment,
} from '#/schemas/pipeline-adjust.js';
import type { PipelineDefinition } from '#/schemas/pipeline.js';
import type {
  AdjustContext,
  AdjustMeta,
  AdjustResult,
} from '#/types/pipeline-adjust.types.js';

export { isLockedStage };

/** Why `op` cannot apply to `def` under `ctx`; empty means it can. */
export function adjustProblems(
  op: PipelineAdjustOp,
  def: PipelineDefinition,
  ctx: AdjustContext,
): AdjustProblem[] {
  const out = applyOp(def, op, ctx);

  return 'problems' in out ? out.problems : [];
}

/**
 * Applies `ops` in order to `base`, each judged against the list the earlier ones left. Never throws:
 * a refused op is dropped with its reason and the list goes on without it. Every op gets one log
 * entry (`meta.seq` is the number of the first). The same inputs always give the same result.
 */
export function applyAdjustments(
  base: PipelineDefinition,
  ops: readonly PipelineAdjustOp[],
  ctx: AdjustContext,
  meta: AdjustMeta,
): AdjustResult {
  let def = base;
  const log: PipelineAdjustment[] = [];
  const problems: AdjustProblem[] = [];
  ops.forEach((op, i) => {
    const out = applyOp(def, op, ctx);
    const entry = {
      seq: (meta.seq ?? 0) + i,
      op,
      by: 'director' as const,
      cause: meta.cause,
      key: adjustmentKey(ctx.lane, op),
      ...(meta.plan_version === undefined ? {} : { plan_version: meta.plan_version }),
      at: meta.at,
    };

    if ('def' in out) {
      def = out.def;
      log.push({ ...entry, status: 'applied' });

      return;
    }

    const why = out.problems[0] as AdjustProblem;
    problems.push(why);
    log.push({ ...entry, status: 'dropped', problem: why.message.slice(0, 500) });
  });

  return {
    definition: def,
    log,
    applied: log.filter((l) => l.status === 'applied'),
    dropped: log.filter((l) => l.status === 'dropped'),
    problems,
  };
}
