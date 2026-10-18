/**
 * Pipeline edit rules: what each control of the pipeline editor may do to a stage list.
 *
 * Why: the owner reshapes a lane with plain buttons (add, move, remove, change the agent; adding lives in domain/pipeline-add), and a
 *   list that quietly lost its merge stage or its independent G1 gate would break the rules that
 *   keep unreviewed work from merging. The rules are pure functions over the list so every
 *   control, the add menu and the tests agree: merge is locked last and G1 is pinned (they show a
 *   lock and a reason instead of buttons), one human sign-off at most, a new stage lands where
 *   it can be valid (writers before G1, checks after it), a check policy stores only what
 *   differs from the defaults (see pipeline-policy). Whether a list may be saved is decided by
 *   core's `pipelineProblems`, never here.
 *
 * Exports: moveStage(), moveAction(), removeStage(), removeAction(), replaceStage(), takenIds(),
 *   roleOf(), isWriterGroup(), usableAgents(), uniqueId(), LOCK_REASONS,
 *   MAX_MEMBERS, MIN_MEMBERS, MAX_STAGES.
 * Depends on: @forge/core, types/pipeline-ui.types. No IO.
 */

import { isWriterRole } from '@forge/core';
import type {
  AgentRole,
  AgentView,
  GroupStage,
  PipelineDefinition,
  Stage,
} from '@forge/core';
import type { StageGate, StageMove } from '#/types/pipeline-ui.types.js';

export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 4;
export const MAX_STAGES = 12;

export const LOCK_REASONS = {
  merge: 'Merge is always the last stage and cannot be removed.',
  g1: 'The independent gate G1 is required after the last writer, so it stays in place.',
} as const;

const isG1 = (s: Stage): boolean => s.kind === 'script_gate' && 'builtin' in s.run;

/** The role of the agent a stage names; `undefined` for anything that is not an agent stage. */
export function roleOf(
  stage: Stage,
  roster: readonly AgentView[],
): AgentRole | undefined {
  return stage.kind === 'agent'
    ? roster.find((a) => a.id === stage.agent)?.definition.role
    : undefined;
}

/** A group whose members are all agents with a writing role: its members work side by side. */
export function isWriterGroup(group: GroupStage, roster: readonly AgentView[]): boolean {
  return group.members.every((m) => isWriterRole(roleOf(m, roster)));
}

/** Agents a stage may name: not switched off and not archived. */
export const usableAgents = (roster: readonly AgentView[]): AgentView[] =>
  roster.filter((a) => !a.tags.includes('disabled') && !a.tags.includes('archived'));

/** `base`, or `base-2`, `base-3` ... until it is free (ids are lowercase slugs up to 40 characters). */
export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  const stem = base.slice(0, 36);
  let id = stem;

  for (let n = 2; taken.has(id); n += 1) {
    id = `${stem}-${n}`;
  }

  return id;
}

/** Every stage and member id in the list. */
export function takenIds(def: PipelineDefinition): Set<string> {
  return new Set(
    def.stages.flatMap((s) =>
      s.kind === 'group' ? [s.id, ...s.members.map((m) => m.id)] : [s.id],
    ),
  );
}

/** Whether stage `id` may move one place in `direction`. */
export function moveAction(
  def: PipelineDefinition,
  id: string,
  direction: StageMove,
): StageGate {
  const at = def.stages.findIndex((s) => s.id === id);
  const stage = def.stages[at];
  const next = def.stages[at + direction];

  if (stage === undefined) {
    return { ok: false, reason: 'That stage is not in the list.' };
  }

  if (stage.kind === 'merge') {
    return { ok: false, reason: LOCK_REASONS.merge };
  }

  if (isG1(stage)) {
    return { ok: false, reason: LOCK_REASONS.g1 };
  }

  if (next === undefined) {
    return { ok: false, reason: 'It is already first.' };
  }

  return next.kind === 'merge'
    ? { ok: false, reason: 'Merge always stays last.' }
    : { ok: true };
}

export function moveStage(
  def: PipelineDefinition,
  id: string,
  direction: StageMove,
): PipelineDefinition {
  if (!moveAction(def, id, direction).ok) {
    return def;
  }

  const stages = [...def.stages];
  const at = stages.findIndex((s) => s.id === id);
  const other = stages[at + direction] as Stage;

  stages[at + direction] = stages[at] as Stage;
  stages[at] = other;

  return { ...def, stages };
}

export function removeAction(def: PipelineDefinition, id: string): StageGate {
  const stage = def.stages.find((s) => s.id === id);

  if (stage?.kind === 'merge') {
    return { ok: false, reason: LOCK_REASONS.merge };
  }

  return stage !== undefined && isG1(stage)
    ? { ok: false, reason: LOCK_REASONS.g1 }
    : { ok: true };
}

export function removeStage(def: PipelineDefinition, id: string): PipelineDefinition {
  return removeAction(def, id).ok
    ? { ...def, stages: def.stages.filter((s) => s.id !== id) }
    : def;
}

/** `def` with the stage that has `next.id` replaced. */
export function replaceStage(def: PipelineDefinition, next: Stage): PipelineDefinition {
  return { ...def, stages: def.stages.map((s) => (s.id === next.id ? next : s)) };
}
