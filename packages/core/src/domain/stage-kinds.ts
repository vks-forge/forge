/**
 * Stage kinds — which stage writes, which checks, which is a gate.
 *
 * Why: a pipeline's safety rules and the engine's cursor both hinge on one question: is this
 *   stage a writer (it changes the worktree), a check (it reads and judges), the G1 gate, or
 *   the human and merge stages. The answer for an agent stage comes from the agent's role, so
 *   it is read from one place: a role map (the roster when a pipeline is saved, the ticket's
 *   snapshot while it runs). An agent nobody knows is `unknown` and never counts as a writer
 *   or as a check, so a list naming it can neither run nor pass (fail closed).
 *
 * Exports: classifyStage(), isWriterRole(), isCheckRole(), flattenStages(), lastWriterIndex(),
 *   pipelineHash().
 * Depends on: shared/sha256, shared/stable-json, schemas/agent, schemas/pipeline, types/stage-cursor.
 *   No IO.
 */

import type { AgentId, AgentRole } from '#/schemas/agent.js';
import type { PipelineDefinition, Stage } from '#/schemas/pipeline.js';
import { sha256Hex } from '#/shared/sha256.js';
import { stableJson } from '#/shared/stable-json.js';
import type { StageClass } from '#/types/stage-cursor.types.js';

/** Roles that change the worktree: a writer and a tester. */
export const isWriterRole = (role: AgentRole | undefined): boolean =>
  role === 'writer' || role === 'tester';

/** Roles that only read and report: a reviewer and a researcher. */
export const isCheckRole = (role: AgentRole | undefined): boolean =>
  role === 'reviewer' || role === 'researcher';

/** The stage's class under `roles`; an agent with no known role is `unknown`. */
export function classifyStage(
  stage: Stage,
  roles: Readonly<Record<AgentId, AgentRole>>,
): StageClass {
  switch (stage.kind) {
    case 'agent': {
      const role = roles[stage.agent];

      if (isWriterRole(role)) {
        return 'writer';
      }

      return isCheckRole(role) ? 'check_agent' : 'unknown';
    }

    case 'script_gate':
      return 'builtin' in stage.run ? 'g1' : 'script';
    case 'group':
      return 'group';
    case 'human':
      return 'human';
    case 'merge':
      return 'merge';
  }
}

/** Every stage of the definition, group members included, in order. */
export function flattenStages(def: PipelineDefinition): Stage[] {
  return def.stages.flatMap<Stage>((s) => (s.kind === 'group' ? [s, ...s.members] : [s]));
}

/** Index of the last writer stage, or -1 when there is none. */
export function lastWriterIndex(
  def: PipelineDefinition,
  roles: Readonly<Record<AgentId, AgentRole>>,
): number {
  let last = -1;
  def.stages.forEach((s, i) => {
    if (classifyStage(s, roles) === 'writer') {
      last = i;
    }
  });

  return last;
}

/** SHA-256 of the canonical definition; the same list always hashes the same. */
export const pipelineHash = (def: PipelineDefinition): string =>
  sha256Hex(stableJson(def));
