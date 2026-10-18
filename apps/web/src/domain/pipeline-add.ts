/**
 * Pipeline add rules: what the Add stage menu offers and what a new stage looks like.
 *
 * Why: a new stage that lands in the wrong place, or a second one of a kind that may appear once,
 *   is refused on save with no hint of why. So the menu asks `addAction()` first (one Director
 *   check, one sign-off, at most 12 stages, each refusal with its reason) and `addStage()` puts
 *   the new stage where it can be valid: writers (alone or as a group of writers) before G1,
 *   checks after G1, the Director check after every check, the sign-off after the Director
 *   check, merge last. A new sign-off asks the owner for tier C and leaves the rest to the
 *   Director, the safe default of the shipped Full lane; a writer group starts with two writers
 *   and the server says in words if their folders overlap.
 *
 * Exports: addStage(), addAction(), newMember(), SIGN_OFF_PROMPT.
 * Depends on: @forge/core, domain/pipeline-edit, types/pipeline-ui.types. No IO.
 */

import { isCheckRole, isWriterRole } from '@forge/core';
import type { AgentRole, AgentView, PipelineDefinition, Stage } from '@forge/core';
import { MAX_STAGES, takenIds, uniqueId, usableAgents } from '#/domain/pipeline-edit.js';
import type { AddKind, Member, StageGate } from '#/types/pipeline-ui.types.js';

export const SIGN_OFF_PROMPT =
  'Look at the finished change and approve it, or send it back with a comment.';

const isG1 = (s: Stage): boolean => s.kind === 'script_gate' && 'builtin' in s.run;

/** Stages that must stay after every check. */
const LAST_ZONE: ReadonlySet<Stage['kind']> = new Set([
  'director_check',
  'sign_off',
  'human',
  'merge',
]);

/** Where a new stage goes so that it can be valid. */
function insertAt(def: PipelineDefinition, kind: AddKind): number {
  const { stages } = def;
  const end = stages.findIndex((s) => s.kind === 'merge');
  const last = end === -1 ? stages.length : end;

  if (kind === 'sign_off') {
    return last;
  }

  if (kind === 'writer_group' || kind === 'writer') {
    const g1 = stages.findIndex(isG1);

    return g1 === -1 ? last : g1;
  }

  const at = stages.findIndex((s) =>
    kind === 'director_check'
      ? s.kind === 'sign_off' || s.kind === 'human' || s.kind === 'merge'
      : LAST_ZONE.has(s.kind),
  );

  return at === -1 ? stages.length : at;
}

function pick(
  roster: readonly AgentView[],
  want: (role: AgentRole) => boolean,
  skip = 0,
): AgentView | undefined {
  return usableAgents(roster).filter((a) => want(a.definition.role))[skip];
}

const SCRIPT_RUN = { command: '', timeout_ms: 120_000, guard_paths: [] as string[] };

function agentMember(
  id: string,
  agent: AgentView | undefined,
  fallback: string,
): Extract<Member, { kind: 'agent' }> {
  return {
    id,
    kind: 'agent',
    label: agent?.definition.name ?? fallback,
    agent: agent?.id ?? '',
  };
}

function groupOf(
  kind: 'group' | 'writer_group',
  taken: ReadonlySet<string>,
  roster: readonly AgentView[],
): Stage {
  const groupId = uniqueId(kind === 'group' ? 'group' : 'writers', taken);
  const want = kind === 'group' ? isCheckRole : isWriterRole;
  const first = pick(roster, want) ?? usableAgents(roster)[0];
  const second = pick(roster, want, 1) ?? first;
  const firstId = uniqueId(`${groupId}-1`, taken);
  const secondId = uniqueId(`${groupId}-2`, new Set([...taken, firstId]));
  const fallback = kind === 'group' ? 'Check' : 'Writer';

  return {
    id: groupId,
    kind: 'group',
    label: kind === 'group' ? 'Run together' : 'Writers together',
    join: 'all',
    members: [
      agentMember(firstId, first, fallback),
      agentMember(secondId, second, fallback),
    ],
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
  let at: number;

  if (kind === 'agent' || kind === 'writer') {
    stage = {
      id: uniqueId(checker?.id ?? 'agent', taken),
      kind: 'agent',
      label: checker?.definition.name ?? 'New agent stage',
      agent: checker?.id ?? '',
    };

    at = insertAt(def, isWriterRole(checker?.definition.role) ? 'writer' : 'agent');
  } else if (kind === 'script_gate') {
    stage = {
      id: uniqueId('script', taken),
      kind: 'script_gate',
      label: 'Script check',
      run: { ...SCRIPT_RUN },
    };

    at = insertAt(def, kind);
  } else if (kind === 'group' || kind === 'writer_group') {
    stage = groupOf(kind, taken, roster);
    at = insertAt(def, kind);
  } else if (kind === 'director_check') {
    stage = { id: uniqueId('check-plan', taken), kind, label: 'Check against the plan' };
    at = insertAt(def, kind);
  } else {
    stage = {
      id: uniqueId('sign-off', taken),
      kind: 'sign_off',
      label: 'Sign-off',
      signer: 'director_or_owner',
      prompt: SIGN_OFF_PROMPT,
    };

    at = insertAt(def, kind);
  }

  return { ...def, stages: [...def.stages.slice(0, at), stage, ...def.stages.slice(at)] };
}

/** Whether the add menu may offer `kind` now. */
export function addAction(def: PipelineDefinition, kind: AddKind): StageGate {
  if (kind === 'director_check' && def.stages.some((s) => s.kind === 'director_check')) {
    return { ok: false, reason: 'A pipeline has at most one Director check.' };
  }

  if (
    kind === 'sign_off' &&
    def.stages.some((s) => s.kind === 'sign_off' || s.kind === 'human')
  ) {
    return { ok: false, reason: 'A pipeline has at most one sign-off.' };
  }

  return def.stages.length >= MAX_STAGES
    ? { ok: false, reason: `A pipeline holds at most ${MAX_STAGES} stages.` }
    : { ok: true };
}

/**
 * A new member for a group: an agent (the first usable reviewer, or the first writer in a
 * writer group) or an empty script.
 */
export function newMember(
  kind: 'agent' | 'script_gate',
  id: string,
  roster: readonly AgentView[],
  writers = false,
): Member {
  if (kind === 'script_gate') {
    return { id, kind, label: 'Script check', run: { ...SCRIPT_RUN } };
  }

  const want = writers ? isWriterRole : isCheckRole;

  return agentMember(id, pick(roster, want) ?? usableAgents(roster)[0], 'Check');
}
