/**
 * Adjustment key — the stable name of one pipeline change.
 *
 * Why: the Director proposes a change to a project's lane only after the same change was applied to
 *   several tickets. "The same change" has to be decided by plain code, so each op gets a key built from
 *   what it does and where (lane, op, the agent or stage it concerns, the anchor) and nothing else: not the
 *   reason the Director quoted, not the stage id it invented for an added stage, not the order the op had in
 *   the log. Two tickets that both got "a security reviewer after G1 on Standard" therefore share one key.
 *
 * Exports: adjustmentKey().
 * Depends on: shared/sha256, schemas/pipeline-adjust, schemas/ticket. No IO.
 */

import type { PipelineAdjustOp } from '#/schemas/pipeline-adjust.js';
import type { Lane } from '#/schemas/ticket.js';
import { sha256Hex } from '#/shared/sha256.js';

const MAX_KEY = 120;

/** The agents an added stage runs, in order: one for an agent stage, the members' for a group. */
function agentsOf(stage: Extract<PipelineAdjustOp, { op: 'add' }>['stage']): string {
  return stage.kind === 'agent'
    ? stage.agent
    : `group(${stage.members.map((m) => (m.kind === 'agent' ? m.agent : 'script')).join('+')})`;
}

function describe(op: PipelineAdjustOp): string {
  switch (op.op) {
    case 'add':
      return `add:${agentsOf(op.stage)}@after:${op.after}`;
    case 'remove':
      return `remove:${op.stage_id}`;
    case 'swap':
      return `swap:${op.stage_id}${op.member_id === undefined ? '' : `#${op.member_id}`}:${op.agent}`;
    case 'move':
      return `move:${op.stage_id}@after:${op.after}`;
  }
}

/**
 * The key of `op` on `lane`, at most 120 characters (a longer one keeps its head and ends with a
 * short hash of the whole, so two long keys still differ).
 */
export function adjustmentKey(lane: Lane, op: PipelineAdjustOp): string {
  const key = `${lane}:${describe(op)}`;

  return key.length <= MAX_KEY
    ? key
    : `${key.slice(0, MAX_KEY - 9)}~${sha256Hex(key).slice(0, 8)}`;
}
