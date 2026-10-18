/**
 * Pipeline order rules — who comes where in a stage list, and which critic family is allowed.
 *
 * Why: the safety floor is as much about order as about content. A writer comes before every
 *   gate and check and no agent checks what it wrote (nobody approves their own work); a reviewer
 *   needs a writer before it; the Director's check judges the finished work, so it comes once,
 *   after G1 and after every other check; and one sign-off (or human) stage closes the list
 *   before merge, so the owner or the Director signs only what everything else passed. Groups
 *   of writers count as writers: each of their agents is in the same position. Once two model
 *   families are connected a critic on the Worker's own family is refused, because models of one
 *   family approve each other (d-0073); with one family it is only a warning shown elsewhere.
 *
 * Exports: orderProblems(), familyProblems().
 * Depends on: domain/{effective-pipelines,pipeline-stage-rules,stage-kinds}, schemas/agent, schemas/pipeline,
 *   types/pipeline-rules. No IO.
 */

import { sameFamilyCritics } from '#/domain/effective-pipelines.js';
import { problem } from '#/domain/pipeline-stage-rules.js';
import { classifyStage } from '#/domain/stage-kinds.js';
import type { AgentRole } from '#/schemas/agent.js';
import type { PipelineDefinition, PipelineProblem, Stage } from '#/schemas/pipeline.js';
import type { PipelineRuleContext } from '#/types/pipeline-rules.types.js';

/** The agents of a writer stage or writer group, with the stage they are on. */
function writerAgentsOf(stage: Stage): { agent: string; label: string }[] {
  if (stage.kind === 'agent') {
    return [{ agent: stage.agent, label: stage.label }];
  }

  return stage.kind === 'group'
    ? stage.members.flatMap((m) =>
        m.kind === 'agent' ? [{ agent: m.agent, label: m.label }] : [],
      )
    : [];
}

const isCheckClass = (c: string | undefined): boolean =>
  c === 'check_agent' || c === 'script' || c === 'group';

/**
 * Who comes where: a writer needs to come before every gate and check, an agent never checks
 * what it wrote, a reviewer needs a writer before it, the Director's check comes once after G1
 * and every check, and one human or sign-off stage closes the list before merge.
 */
export function orderProblems(
  def: PipelineDefinition,
  roles: Record<string, AgentRole>,
): PipelineProblem[] {
  const out: PipelineProblem[] = [];
  const classes = def.stages.map((s) => classifyStage(s, roles));
  const signers = classes.filter((c) => c === 'human' || c === 'sign_off').length;
  const checkers = new Set<string>(['check_agent', 'script', 'group', 'g1']);
  const writerAgents = new Set<string>();
  let g1Seen = false;
  let checkSeen = false;
  let directorChecks = 0;
  def.stages.forEach((s, i) => {
    const c = classes[i];
    if (c === 'writer' || c === 'writer_group') {
      for (const w of writerAgentsOf(s)) {
        if (g1Seen || checkSeen) {
          // The same agent now sits where checks sit: it would be approving its own work.
          if (writerAgents.has(w.agent)) {
            out.push(
              problem(
                'self_review',
                `${w.label}: an agent cannot check its own work`,
                s.id,
              ),
            );
          } else if (checkSeen) {
            out.push(
              problem(
                'writer_after_check',
                `${w.label}: a writer cannot come after a check`,
                s.id,
              ),
            );
          }
        }

        writerAgents.add(w.agent);
      }
    } else if (c === 'g1') {
      g1Seen = true;
    } else if (isCheckClass(c)) {
      checkSeen = true;
      if (c === 'check_agent' && writerAgents.size === 0) {
        out.push(
          problem(
            'reviewer_first',
            `${s.label}: a reviewer needs a writer before it`,
            s.id,
          ),
        );
      }
    } else if (c === 'director_check') {
      directorChecks++;
      const checksAfter = classes.some((k, j) => j > i && checkers.has(k));
      const g1Before = classes.slice(0, i).includes('g1');
      if (directorChecks > 1) {
        out.push(
          problem(
            'director_check_duplicate',
            `${s.label}: the Director check appears once`,
            s.id,
          ),
        );
      }

      if (!g1Before || checksAfter) {
        out.push(
          problem(
            'director_check_position',
            `${s.label}: the Director check comes after G1 and every other check`,
            s.id,
          ),
        );
      }
    } else if (c === 'human' || c === 'sign_off') {
      const after = classes.some(
        (k, j) => j > i && (checkers.has(k) || k === 'director_check'),
      );

      const code = c === 'human' ? 'human_position' : 'sign_off_position';
      if (signers > 1 || after) {
        out.push(
          problem(
            code,
            `${s.label}: one sign-off stage, after every check and the Director check`,
            s.id,
          ),
        );
      }
    }
  });

  return out;
}

/** The critic must not share the Worker's model family once a second family is connected (d-0073). */
export function familyProblems(
  def: PipelineDefinition,
  ctx: PipelineRuleContext,
): PipelineProblem[] {
  if (new Set(ctx.families_available).size < 2) {
    return [];
  }

  return sameFamilyCritics(def, ctx.roster).map((s) =>
    problem(
      'critic_same_family',
      `${s.label}: the critic runs on the same model family as the Worker; pick another family`,
      s.id,
    ),
  );
}
