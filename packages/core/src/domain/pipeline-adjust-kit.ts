/**
 * Pipeline adjustment kit — the locks and the shared checks every op of the Director goes through.
 *
 * Why: merge, G1, every script gate, a person's step and a stage a routing rule added are the owner's (d-0149,
 *   d-0151): the Director may change what an LLM agent does, never a deterministic check or a rule. One function
 *   says which stages those are, and one check runs the pipeline rules over any result, so the four ops
 *   (add, remove, swap, move) cannot disagree about what is locked or what a valid list is, and an op that
 *   fails returns the same shape of reason whichever op it was.
 *
 * Exports: refuse(), isLockedStage(), lockedMessage(), startedMessage(), checked(), roleOf().
 * Depends on: domain/pipeline-rules, schemas/pipeline, schemas/pipeline-adjust, types/pipeline-adjust. No IO.
 */

import { pipelineProblems } from '#/domain/pipeline-rules.js';
import type { AdjustProblem } from '#/schemas/pipeline-adjust.js';
import type { PipelineDefinition, Stage } from '#/schemas/pipeline.js';
import type { AdjustContext, AdjustOutcome } from '#/types/pipeline-adjust.types.js';

export const refuse = (
  code: AdjustProblem['code'],
  message: string,
  stage_id?: string,
): AdjustOutcome => ({
  problems: [{ code, message, ...(stage_id === undefined ? {} : { stage_id }) }],
});

/**
 * True when the Director may not remove, replace or move `stage`: the merge door, any script gate
 * (G1 included), a human or sign-off stage, a stage a routing rule added, or a group holding one.
 */
export function isLockedStage(stage: Stage, routed: ReadonlySet<string>): boolean {
  switch (stage.kind) {
    case 'merge':
    case 'script_gate':
    case 'human':
    case 'sign_off':
      return true;
    case 'agent':
    case 'director_check':
      return routed.has(stage.id);
    case 'group':
      return (
        routed.has(stage.id) ||
        stage.members.some((m) => m.kind === 'script_gate' || routed.has(m.id))
      );
  }
}

export const lockedMessage = (stage: Stage): string =>
  `${stage.label} is locked: the Director may change what an agent does, never a gate, a person's step, the merge or a rule of yours`;

export const startedMessage = (id: string): string =>
  `${id} already started in this ticket, so it cannot change`;

/** Checks the result of an op against the pipeline rules; the rules' own problems ride along. */
export function checked(def: PipelineDefinition, ctx: AdjustContext): AdjustOutcome {
  const problems = pipelineProblems(def, ctx);
  if (problems.length === 0) {
    return { def };
  }

  return {
    problems: [
      {
        code: 'adjust_rules',
        message: `the result would break a pipeline rule: ${problems.map((p) => p.message).join('; ')}`,
        problems,
      },
    ],
  };
}

export const roleOf = (ctx: AdjustContext, agent: string) =>
  ctx.roster.find((e) => e.id === agent)?.definition.role;
