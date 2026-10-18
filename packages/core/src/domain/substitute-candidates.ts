/**
 * Substitute candidates — the agents the Director may choose from when a stage's agent cannot run.
 *
 * Why: when an agent and every fallback of its own fail, the Director may pick another agent for that stage
 *   (d-0080), but it must pick from a list code built, never from the whole roster, because a model can be
 *   talked into naming anything. A candidate is the exact swap the pipeline door would accept: the same role,
 *   a writer's scope no wider than the original's, not disabled or archived, not an agent that would check
 *   work it wrote, and (for a critic) not on the Worker's family once two are connected. On top of that its
 *   harness must be ready now. Reusing the swap rule means the candidates and the later swap cannot disagree.
 *   An empty list is a valid answer: the item then goes to the owner.
 *
 * Exports: substituteCandidates().
 * Depends on: domain/{effective-pipelines,pipeline-adjust,stage-kinds}, schemas/pipeline, schemas/ticket, types/pipeline-rules. No IO.
 */

import { isCritic, modelFamilyOf } from '#/domain/effective-pipelines.js';
import { adjustProblems } from '#/domain/pipeline-adjust.js';
import { classifyStage } from '#/domain/stage-kinds.js';
import type { PipelineDefinition } from '#/schemas/pipeline.js';
import type { Lane } from '#/schemas/ticket.js';
import type { RosterEntry } from '#/types/pipeline-rules.types.js';

/**
 * The roster agents that may take over `stage` (a stage id, with `member` for a group member) from
 * `failedAgent`, by id. `ready` says whether an agent's harness can start a run now; `families` are the
 * model families connected.
 */
export function substituteCandidates(input: {
  readonly stage: { readonly id: string; readonly member?: string };
  readonly failedAgent: string;
  readonly roster: readonly RosterEntry[];
  readonly snapshot: { readonly definition: PipelineDefinition; readonly lane: Lane };
  readonly routed?: readonly string[];
  readonly ready: (entry: RosterEntry) => boolean;
  readonly families: readonly string[];
}): RosterEntry[] {
  const ctx = {
    roster: input.roster,
    lane: input.snapshot.lane,
    families_available: input.families,
    routed: input.routed ?? [],
  };

  // A critic stands in for the independent look: once two families are connected, its substitute must not
  // share a model family with any writer of the ticket (d-0073), whatever the substitute is called.
  const failed = input.roster.find((e) => e.id === input.failedAgent);
  const roles = Object.fromEntries(input.roster.map((e) => [e.id, e.definition.role]));
  const writerFamilies = new Set(
    input.snapshot.definition.stages.flatMap((s) => {
      const klass = classifyStage(s, roles);
      const agents =
        klass === 'writer' && s.kind === 'agent'
          ? [s.agent]
          : klass === 'writer_group' && s.kind === 'group'
            ? s.members.flatMap((m) => (m.kind === 'agent' ? [m.agent] : []))
            : [];

      return agents.flatMap((a) => {
        const entry = input.roster.find((e) => e.id === a);

        return entry ? [modelFamilyOf(entry.definition.runs_on.model)] : [];
      });
    }),
  );

  const guarded =
    failed !== undefined && isCritic(failed) && new Set(input.families).size >= 2;

  return input.roster
    .filter((e) => e.id !== input.failedAgent && input.ready(e))
    .filter(
      (e) => !guarded || !writerFamilies.has(modelFamilyOf(e.definition.runs_on.model)),
    )
    .filter(
      (e) =>
        adjustProblems(
          {
            op: 'swap',
            stage_id: input.stage.id,
            ...(input.stage.member === undefined
              ? {}
              : { member_id: input.stage.member }),
            agent: e.id,
            reason: 'candidate check, never stored',
          },
          input.snapshot.definition,
          ctx,
        ).length === 0,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}
