/**
 * Stage labels and policies: how one stage attempt is named and what blocks it.
 *
 * Why: the owner reads a stage by its label ("Review and critique: Critique" for a group member), and
 *   whether findings send work back or hold it depends on the stage's own policy over its group's over
 *   the defaults. A checked attempt, a script gate and the ticket page all need the same name and the
 *   same rule, so they are read here once rather than rebuilt where each result is applied.
 *
 * Exports: labelOf(), policyOf().
 * Depends on: @forge/core (checkPolicy), types. No IO.
 */

import { checkPolicy } from '@forge/core';
import type { ResolvedPolicy, StageRun, TicketPipeline } from '@forge/core';

/** The label the owner reads for this attempt: the group's, then the member's. */
export function labelOf(snapshot: TicketPipeline, row: StageRun): string {
  const stage = snapshot.definition.stages.find((s) => s.id === row.stage_id);
  if (stage?.kind === 'group') {
    const member = stage.members.find((m) => m.id === row.member_id);

    return `${stage.label}: ${member?.label ?? row.member_id}`;
  }

  return stage?.label ?? row.stage_id;
}

/** The blocking policy of an attempt: its own settings over its group's, over the defaults. */
export function policyOf(snapshot: TicketPipeline, row: StageRun): ResolvedPolicy {
  const stage = snapshot.definition.stages.find((s) => s.id === row.stage_id);
  if (!stage) {
    return checkPolicy({ id: 'x', kind: 'human', label: 'x', prompt: 'x' });
  }

  const own =
    stage.kind === 'group' ? stage.members.find((m) => m.id === row.member_id) : stage;

  const base = checkPolicy(stage);
  const mine =
    own && own.kind !== 'human' && own.kind !== 'merge' ? checkPolicy(own) : base;

  return {
    on_blocking:
      own && 'on_blocking' in own && own.on_blocking !== undefined
        ? mine.on_blocking
        : base.on_blocking,
    blocking:
      own && 'blocking' in own && own.blocking !== undefined
        ? mine.blocking
        : base.blocking,
  };
}
