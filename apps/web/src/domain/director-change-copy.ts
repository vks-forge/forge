/**
 * Director change copy: the words for what the Director changed in a ticket's pipeline, which
 * agent or fallback actually ran a stage, and what an op in a plan means.
 *
 * Why: the owner approved a lane's pipeline and a plan; if the Director then added a security
 *   reviewer, swapped an agent or dropped a check, the owner must be able to tell their own list
 *   from the Director's and see the reason beside the stage, never find out later from a diff.
 *   A removed stage has no chip any more, so it is worded as a ghost with its reason; an op the
 *   engine could not apply is worded as "not applied" with the problem. A stage that ran on a
 *   fallback model or on a substitute agent says so, because it changes who wrote the code. One
 *   `opWords()` serves the plan tab, the proposal diff and the adjustment log so an op reads the
 *   same everywhere. Pure.
 *
 * Exports: opWords(), changeBadge(), changedLine(), ranOnLine(), slotWords(), ranOnShort(), removedLine(),
 *   adjustmentLine(), changesHeadline(), laneWithOpsLine(), isLighter(), lighterWords().
 * Depends on: @forge/core (types), domain/pipeline-copy. No IO.
 */

import type {
  Lane,
  PipelineAdjustment,
  PipelineAdjustOp,
  StageView,
  TicketPipelineView,
} from '@forge/core';
import { LANE_LABEL } from '#/domain/pipeline-copy.js';

/** "Add Security review after g1", "Remove review", ...: one op in the owner's words. */
export function opWords(op: PipelineAdjustOp): string {
  switch (op.op) {
    case 'add':
      return `Add ${op.stage.label} after ${op.after}`;
    case 'remove':
      return `Remove ${op.stage_id}`;
    case 'swap':
      return `Swap ${op.member_id ?? op.stage_id} to agent ${op.agent}`;
    case 'move':
      return `Move ${op.stage_id} after ${op.after}`;
  }
}

/** The short badge on a chip the Director changed. */
export function changeBadge(changed: NonNullable<StageView['changed']>): string {
  if (changed.cause === 'fallback') {
    return 'Substitute';
  }

  return changed.op === 'add'
    ? 'Added by Director'
    : changed.op === 'move'
      ? 'Moved by Director'
      : 'Swapped by Director';
}

/** The sentence in a stage's detail: what changed and the reason given. */
export function changedLine(changed: NonNullable<StageView['changed']>): string {
  const lead =
    changed.cause === 'fallback'
      ? 'Substitute agent chosen by the Director'
      : changed.op === 'add'
        ? 'Added by the Director'
        : changed.op === 'move'
          ? 'Moved by the Director'
          : 'Agent swapped by the Director';

  return `${lead}: ${changed.reason}`;
}

/** What the stage's latest run used, or `null` when it ran on its own agent's first choice. */
export function ranOnLine(ranOn: NonNullable<StageView['ran_on']>): string | null {
  const place = ranOn.model === undefined ? ranOn.harness : ranOn.model;

  if (ranOn.slot === -1) {
    return `Ran as the substitute agent (${place})`;
  }

  return ranOn.slot > 0 ? `Ran on fallback ${ranOn.slot} (${place})` : null;
}

/** "on fallback 2" / "as the substitute" for a run's slot; `undefined` for the agent's first choice or an older run. */
export function slotWords(slot: number | undefined): string | undefined {
  if (slot === undefined || slot === 0) {
    return undefined;
  }

  return slot === -1 ? 'as the substitute' : `on fallback ${slot}`;
}

/** The tail of a chip's sub-line: ", ran on fallback 2" or ", ran as substitute"; empty on the first choice. */
export function ranOnShort(ranOn: StageView['ran_on']): string {
  if (ranOn === undefined || ranOn.slot === 0) {
    return '';
  }

  return ranOn.slot === -1 ? ', ran as substitute' : `, ran on fallback ${ranOn.slot}`;
}

/** The ghost chip's line for a stage the Director removed. */
export function removedLine(removed: TicketPipelineView['removed'][number]): string {
  return `Removed by the Director: ${removed.reason}`;
}

/** One entry of the adjustment log, applied or dropped. */
export function adjustmentLine(adjustment: PipelineAdjustment): string {
  const what = opWords(adjustment.op);

  return adjustment.status === 'applied'
    ? `${what}: ${adjustment.op.reason}`
    : `Not applied: ${what}. ${adjustment.problem ?? 'It no longer fit the lane.'}`;
}

/** "Changed by the Director (2 changes)", with dropped ones counted apart. */
export function changesHeadline(adjustments: readonly PipelineAdjustment[]): string {
  const applied = adjustments.filter((a) => a.status === 'applied').length;
  const dropped = adjustments.length - applied;

  if (applied === 0) {
    return `The Director’s changes were not applied (${dropped})`;
  }

  const base = `Changed by the Director (${applied} change${applied === 1 ? '' : 's'})`;

  return dropped === 0 ? base : `${base}, ${dropped} not applied`;
}

/** "Standard + 2 Director changes": a plan ticket's pipeline in one line. */
export function laneWithOpsLine(
  lane: Lane | undefined,
  ops: readonly PipelineAdjustOp[],
): string {
  const name = lane === undefined ? 'Lane' : LANE_LABEL[lane];

  return `${name} + ${ops.length} Director change${ops.length === 1 ? '' : 's'}`;
}

/** True when an op takes a stage away, which makes the plan wait for the owner. */
export function isLighter(ops: readonly PipelineAdjustOp[]): boolean {
  return ops.some((op) => op.op === 'remove');
}

/** "Needs your approval: removes review", or `null` when no op takes a stage away. */
export function lighterWords(ops: readonly PipelineAdjustOp[]): string | null {
  const removed = ops.flatMap((op) => (op.op === 'remove' ? [op.stage_id] : []));

  return removed.length === 0
    ? null
    : `Needs your approval: removes ${removed.join(', ')}`;
}
