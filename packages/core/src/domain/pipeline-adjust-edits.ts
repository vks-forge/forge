/**
 * Pipeline adjustment edits — swapping an agent and moving a stage.
 *
 * Why: a swap is how a substitute takes over a stage that cannot run, and the only danger in it is the change
 *   itself: a new agent with another role, or a writer allowed to write more than the one it replaces, would
 *   change what the ticket may do. So a swap keeps the role and a writer's scope stays within the original's
 *   (`scopeWithin`), never touches a locked or started stage, and the result must pass the pipeline rules
 *   (no agent checking its own work). A move only reorders an unlocked, not started stage after a stage that
 *   exists, and is judged by the same rules. An op that fails returns its reason and leaves the list as it was.
 *
 * Exports: swapOp(), moveOp().
 * Depends on: domain/{pipeline-adjust-kit,scope-overlap,stage-kinds}, schemas/pipeline, schemas/pipeline-adjust,
 *   types/pipeline-adjust. No IO.
 */

import {
  checked,
  isLockedStage,
  lockedMessage,
  refuse,
  startedMessage,
} from '#/domain/pipeline-adjust-kit.js';
import { scopeWithin } from '#/domain/scope-overlap.js';
import { isWriterRole } from '#/domain/stage-kinds.js';
import type { PipelineAdjustOp } from '#/schemas/pipeline-adjust.js';
import type { PipelineDefinition, Stage } from '#/schemas/pipeline.js';
import type { AdjustContext, AdjustOutcome } from '#/types/pipeline-adjust.types.js';

/** The agent stage a swap points at (a lone stage, or the named member of a group), with where to put the change back. */
function swapTarget(
  def: PipelineDefinition,
  op: Extract<PipelineAdjustOp, { op: 'swap' }>,
) {
  const stage = def.stages.find((s) => s.id === op.stage_id);
  if (stage?.kind === 'group' && op.member_id !== undefined) {
    const member = stage.members.find((m) => m.id === op.member_id);

    return member?.kind === 'agent' ? { stage, member } : null;
  }

  return stage?.kind === 'agent' && op.member_id === undefined
    ? { stage, member: stage }
    : null;
}

export function swapOp(
  def: PipelineDefinition,
  op: Extract<PipelineAdjustOp, { op: 'swap' }>,
  ctx: AdjustContext,
): AdjustOutcome {
  const found = def.stages.find((s) => s.id === op.stage_id);
  if (found && isLockedStage(found, new Set(ctx.routed))) {
    return refuse('locked_stage', lockedMessage(found), found.id);
  }

  if ((ctx.frozen ?? []).includes(op.stage_id)) {
    return refuse('locked_stage', startedMessage(op.stage_id), op.stage_id);
  }

  const target = swapTarget(def, op);
  if (!target) {
    return refuse(
      'adjust_unknown_stage',
      `"${op.stage_id}" is not an agent stage that can be swapped`,
      op.stage_id,
    );
  }

  const next = ctx.roster.find((e) => e.id === op.agent);
  const old = ctx.roster.find((e) => e.id === target.member.agent);
  if (!next) {
    return refuse('adjust_unknown_agent', `there is no agent "${op.agent}"`, op.stage_id);
  }

  if (!old || next.definition.role !== old.definition.role) {
    return refuse(
      'adjust_role_change',
      `${op.agent} is a ${next.definition.role}; this stage needs the same role as ${target.member.agent}`,
      op.stage_id,
    );
  }

  if (next.id === old.id) {
    return refuse('adjust_rules', `${op.stage_id} already runs ${op.agent}`, op.stage_id);
  }

  if (
    isWriterRole(old.definition.role) &&
    !scopeWithin(next.definition.write_scope, old.definition.write_scope)
  ) {
    return refuse(
      'adjust_scope_wider',
      `${op.agent} may write more than ${old.id} may; a substitute never widens a writer's scope`,
      op.stage_id,
    );
  }

  const swapped = { ...target.member, agent: op.agent } as Stage;
  const stages = def.stages.map((s): Stage => {
    if (s.id !== op.stage_id) {
      return s;
    }

    return s.kind === 'group'
      ? {
          ...s,
          members: s.members.map((m) =>
            m.id === op.member_id ? (swapped as typeof m) : m,
          ),
        }
      : swapped;
  });

  return checked({ ...def, stages }, ctx);
}

export function moveOp(
  def: PipelineDefinition,
  op: Extract<PipelineAdjustOp, { op: 'move' }>,
  ctx: AdjustContext,
): AdjustOutcome {
  const from = def.stages.findIndex((s) => s.id === op.stage_id);
  const stage = def.stages[from];
  if (!stage) {
    return refuse(
      'adjust_unknown_stage',
      `there is no stage "${op.stage_id}"`,
      op.stage_id,
    );
  }

  if (isLockedStage(stage, new Set(ctx.routed))) {
    return refuse('locked_stage', lockedMessage(stage), stage.id);
  }

  const frozen = new Set(ctx.frozen ?? []);
  if (frozen.has(stage.id)) {
    return refuse('locked_stage', startedMessage(stage.id), stage.id);
  }

  const rest = def.stages.filter((_, i) => i !== from);
  const at = rest.findIndex((s) => s.id === op.after);
  if (at < 0) {
    return refuse(
      'adjust_unknown_stage',
      `there is no stage "${op.after}" to move after`,
      op.after,
    );
  }

  if (rest.slice(at + 1).some((s) => frozen.has(s.id))) {
    return refuse(
      'locked_stage',
      `${stage.label} would run before a stage that already started`,
      stage.id,
    );
  }

  const stages = [...rest];
  stages.splice(at + 1, 0, stage);
  if (stages.every((s, i) => s.id === (def.stages[i] as Stage).id)) {
    return refuse('adjust_rules', `${stage.label} is already there`, stage.id);
  }

  return checked({ ...def, stages }, ctx);
}
