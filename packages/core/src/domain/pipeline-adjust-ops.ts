/**
 * Pipeline adjustment ops — adding and removing stages, and the dispatcher over all four ops.
 *
 * Why: an op on a ticket's pipeline copy is untrusted (the plan that carries it was drafted from repository text
 *   a stranger may have written), so each one is checked in plain code before it changes anything. An add never
 *   carries a command (a group with a script gate is refused), takes a `dir-` id that is new, names agents that
 *   exist and never runs before a stage that already started; a remove never takes a locked or started stage and
 *   leaves a group of one as the lone member. Swap and move live in `pipeline-adjust-edits`. An op that fails
 *   returns its reason and leaves the list as it was.
 *
 * Exports: addOp(), removeOp(), applyOp().
 * Depends on: domain/{pipeline-adjust-edits,pipeline-adjust-kit,stage-kinds}, schemas/pipeline,
 *   schemas/pipeline-adjust, types/pipeline-adjust. No IO.
 */

import { moveOp, swapOp } from '#/domain/pipeline-adjust-edits.js';
import {
  checked,
  isLockedStage,
  lockedMessage,
  refuse,
  roleOf,
  startedMessage,
} from '#/domain/pipeline-adjust-kit.js';
import { flattenStages } from '#/domain/stage-kinds.js';
import type { PipelineAdjustOp } from '#/schemas/pipeline-adjust.js';
import type { PipelineDefinition, Stage } from '#/schemas/pipeline.js';
import type { AdjustContext, AdjustOutcome } from '#/types/pipeline-adjust.types.js';

export function addOp(
  def: PipelineDefinition,
  op: Extract<PipelineAdjustOp, { op: 'add' }>,
  ctx: AdjustContext,
): AdjustOutcome {
  const { stage } = op;
  const at = def.stages.findIndex((s) => s.id === op.after);
  if (at < 0) {
    return refuse(
      'adjust_unknown_stage',
      `there is no stage "${op.after}" to add after`,
      op.after,
    );
  }

  if (stage.kind === 'group' && stage.members.some((m) => m.kind === 'script_gate')) {
    return refuse(
      'locked_stage',
      'a group the Director adds holds agents only, never a script gate',
      stage.id,
    );
  }

  const present = new Set(flattenStages(def).map((s) => s.id));
  const wanted = [
    stage.id,
    ...(stage.kind === 'group' ? stage.members.map((m) => m.id) : []),
  ];

  const clash = wanted.find((id) => present.has(id));
  if (clash !== undefined) {
    return refuse(
      'adjust_duplicate_id',
      `a stage with id "${clash}" already exists`,
      clash,
    );
  }

  if (wanted.some((id) => !id.startsWith('dir-'))) {
    return refuse(
      'adjust_rules',
      'stages the Director adds have ids that start with dir-',
      stage.id,
    );
  }

  const agents =
    stage.kind === 'agent'
      ? [stage.agent]
      : stage.members.flatMap((m) => (m.kind === 'agent' ? [m.agent] : []));

  const unknown = agents.find((a) => roleOf(ctx, a) === undefined);
  if (unknown !== undefined) {
    return refuse('adjust_unknown_agent', `there is no agent "${unknown}"`, stage.id);
  }

  if (startedAfter(def, at, ctx)) {
    return refuse(
      'locked_stage',
      `the new stage would run before ${startedAfter(def, at, ctx)}, which already started`,
      stage.id,
    );
  }

  const stages = [...def.stages];
  stages.splice(at + 1, 0, stage as Stage);

  return checked({ ...def, stages }, ctx);
}

/** The id of a started stage that sits after index `at`, or undefined: a stage added there would run before it. */
function startedAfter(
  def: PipelineDefinition,
  at: number,
  ctx: AdjustContext,
): string | undefined {
  const frozen = new Set(ctx.frozen ?? []);

  return def.stages.slice(at + 1).find((s) => frozen.has(s.id))?.id;
}

export function removeOp(
  def: PipelineDefinition,
  op: Extract<PipelineAdjustOp, { op: 'remove' }>,
  ctx: AdjustContext,
): AdjustOutcome {
  const routed = new Set(ctx.routed);
  const frozen = new Set(ctx.frozen ?? []);
  const top = def.stages.findIndex((s) => s.id === op.stage_id);
  if (top >= 0) {
    const stage = def.stages[top] as Stage;
    if (isLockedStage(stage, routed)) {
      return refuse('locked_stage', lockedMessage(stage), stage.id);
    }

    if (frozen.has(stage.id)) {
      return refuse('locked_stage', startedMessage(stage.id), stage.id);
    }

    return checked({ ...def, stages: def.stages.filter((_, i) => i !== top) }, ctx);
  }

  const group = def.stages.find(
    (s) => s.kind === 'group' && s.members.some((m) => m.id === op.stage_id),
  );

  if (group?.kind !== 'group') {
    return refuse(
      'adjust_unknown_stage',
      `there is no stage "${op.stage_id}"`,
      op.stage_id,
    );
  }

  if (isLockedStage(group, routed)) {
    return refuse('locked_stage', lockedMessage(group), group.id);
  }

  if (frozen.has(group.id)) {
    return refuse('locked_stage', startedMessage(group.id), group.id);
  }

  const rest = group.members.filter((m) => m.id !== op.stage_id);
  // A group left with one member is that member on its own: a group needs two.
  const replacement: Stage[] =
    rest.length === 1 ? [rest[0] as Stage] : [{ ...group, members: rest }];

  return checked(
    {
      ...def,
      stages: def.stages.flatMap((s) => (s.id === group.id ? replacement : [s])),
    },
    ctx,
  );
}

export function applyOp(
  def: PipelineDefinition,
  op: PipelineAdjustOp,
  ctx: AdjustContext,
): AdjustOutcome {
  switch (op.op) {
    case 'add':
      return addOp(def, op, ctx);
    case 'remove':
      return removeOp(def, op, ctx);
    case 'swap':
      return swapOp(def, op, ctx);
    case 'move':
      return moveOp(def, op, ctx);
  }
}
