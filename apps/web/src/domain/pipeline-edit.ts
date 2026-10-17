/**
 * Pipeline edit rules: what each control of the pipeline editor may do to a stage list.
 *
 * Why: the owner reshapes a lane with plain buttons (add, move, remove, change the agent), and a
 *   list that quietly lost its merge stage or its independent G1 gate would break the rules that
 *   keep unreviewed work from merging. The rules are pure functions over the list so every
 *   control, the add menu and the tests agree: merge is locked last and G1 is pinned (they show a
 *   lock and a reason instead of buttons), one human sign-off at most, a new stage lands where
 *   it can be valid (writers before G1, checks after it), a check policy stores only what
 *   differs from the defaults (see pipeline-policy). Whether a list may be saved is decided by
 *   core's `pipelineProblems`, never here.
 *
 * Exports: addStage(), addAction(), moveStage(), moveAction(), removeStage(), removeAction(),
 *   replaceStage(), newMember(), takenIds(), roleOf(), usableAgents(), uniqueId(), LOCK_REASONS,
 *   MAX_MEMBERS, MIN_MEMBERS, MAX_STAGES, HUMAN_PROMPT.
 * Depends on: @forge/core, types/pipeline-ui.types. No IO.
 */

import { isCheckRole, isWriterRole } from '@forge/core';
import type { AgentRole, AgentView, PipelineDefinition, Stage } from '@forge/core';
import type { AddKind, Member, StageGate, StageMove } from '#/types/pipeline-ui.types.js';

export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 4;
export const MAX_STAGES = 12;
export const HUMAN_PROMPT =
  'Look at the finished change and approve it, or send it back with a comment.';

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

/** Where a new stage goes so that it can be valid: writers before G1, the rest after it. */
function insertAt(def: PipelineDefinition, kind: AddKind, writer: boolean): number {
  const { stages } = def;
  const merge = stages.findIndex((s) => s.kind === 'merge');
  const end = merge === -1 ? stages.length : merge;
  const g1 = stages.findIndex(isG1);

  if (kind === 'human') {
    return end;
  }

  if (kind === 'agent' && writer) {
    return g1 === -1 ? end : g1;
  }

  const human = stages.findIndex((s) => s.kind === 'human');

  return human === -1 ? end : human;
}

function pick(
  roster: readonly AgentView[],
  want: (role: AgentRole) => boolean,
  skip = 0,
): AgentView | undefined {
  return usableAgents(roster).filter((a) => want(a.definition.role))[skip];
}

const SCRIPT_RUN = { command: '', timeout_ms: 120_000, guard_paths: [] as string[] };

function checkMember(
  id: string,
  agent: AgentView | undefined,
): Extract<Member, { kind: 'agent' }> {
  return {
    id,
    kind: 'agent',
    label: agent?.definition.name ?? 'Check',
    agent: agent?.id ?? '',
  };
}

/** `def` with a new stage of `kind` and a default agent from `roster`. */
export function addStage(
  def: PipelineDefinition,
  kind: AddKind,
  roster: readonly AgentView[],
): PipelineDefinition {
  const taken = takenIds(def);
  const checker = pick(roster, isCheckRole) ?? usableAgents(roster)[0];
  let stage: Stage;
  let writer = false;

  if (kind === 'agent') {
    stage = {
      id: uniqueId(checker?.id ?? 'agent', taken),
      kind: 'agent',
      label: checker?.definition.name ?? 'New agent stage',
      agent: checker?.id ?? '',
    };

    writer = isWriterRole(checker?.definition.role);
  } else if (kind === 'script_gate') {
    stage = {
      id: uniqueId('script', taken),
      kind: 'script_gate',
      label: 'Script check',
      run: { ...SCRIPT_RUN },
    };
  } else if (kind === 'group') {
    const groupId = uniqueId('group', taken);
    const second = pick(roster, isCheckRole, 1) ?? checker;

    stage = {
      id: groupId,
      kind: 'group',
      label: 'Run together',
      join: 'all',
      members: [
        checkMember(uniqueId(`${groupId}-1`, taken), checker),
        checkMember(
          uniqueId(`${groupId}-2`, new Set([...taken, `${groupId}-1`])),
          second,
        ),
      ],
    };
  } else {
    stage = {
      id: uniqueId('human', taken),
      kind: 'human',
      label: 'Your sign-off',
      prompt: HUMAN_PROMPT,
    };
  }

  const at = insertAt(def, kind, writer);

  return { ...def, stages: [...def.stages.slice(0, at), stage, ...def.stages.slice(at)] };
}

/** Whether the add menu may offer `kind` now. */
export function addAction(def: PipelineDefinition, kind: AddKind): StageGate {
  if (kind === 'human' && def.stages.some((s) => s.kind === 'human')) {
    return { ok: false, reason: 'A pipeline has at most one human sign-off.' };
  }

  return def.stages.length >= MAX_STAGES
    ? { ok: false, reason: `A pipeline holds at most ${MAX_STAGES} stages.` }
    : { ok: true };
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

/** A new check for a group: an agent (the first usable reviewer) or an empty script. */
export function newMember(
  kind: 'agent' | 'script_gate',
  id: string,
  roster: readonly AgentView[],
): Member {
  return kind === 'agent'
    ? checkMember(id, pick(roster, isCheckRole) ?? usableAgents(roster)[0])
    : { id, kind: 'script_gate', label: 'Script check', run: { ...SCRIPT_RUN } };
}
