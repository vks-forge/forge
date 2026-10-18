/**
 * Stage agent: which agent a ticket's next run will use, read without writing anything.
 *
 * Why: the scheduler picks a harness for a ticket before the run starts, and the harness is the
 *   agent's own choice (its `runs_on`, its fallback list). With pipelines the agent is the one
 *   the ticket's next stage names: the pipeline's first writer before its first dispatch, the
 *   cursor's writer or first check afterwards. The scheduler and the dispatch must agree or a
 *   ticket could be given a slot on a harness its stage does not run on, so both read the same
 *   rows. When the stage's agent cannot run, the implementer stands in for the scheduling
 *   decision only; the dispatch itself refuses the run (fail closed) and parks the ticket.
 *
 * Exports: peekAgent(), firstCheckAgent(), memberAgent().
 * Depends on: @forge/core (effectivePipelines, classifyStage), tick/run-agent, tick/stage-state,
 *   tick/tick-config. Reads storage.
 */

import { classifyStage, effectivePipelines } from '@forge/core';
import type { AgentRole, CheckMember, Stage, StorageTx, Ticket } from '@forge/core';
import { agentViews, resolveAgent, resolveStageAgent } from '#/tick/run-agent.js';
import { readStageState } from '#/tick/stage-state.js';
import { projectSettings } from '#/tick/tick-config.js';
import type { ResolvedAgent } from '#/types/run-agent.types.js';
import type { TickConfig } from '#/types/tick.types.js';

/** The agent id of the first agent among the members to start, if any. */
export const firstCheckAgent = (members: readonly CheckMember[]): string | undefined =>
  members.flatMap((m) => (m.stage.kind === 'agent' ? [m.stage.agent] : []))[0];

/** The agent of `member` among the members to start; the first agent member when none is named. */
export const memberAgent = (
  members: readonly CheckMember[],
  member?: string,
): string | undefined =>
  member === undefined
    ? firstCheckAgent(members)
    : firstCheckAgent(members.filter((m) => m.id === member));

/** The first agent a pipeline's writers name: a lone writer stage's, or the first member of a writer group. */
function firstWriterAgent(
  stages: readonly Stage[],
  roles: Readonly<Record<string, AgentRole>>,
): string | undefined {
  for (const s of stages) {
    const klass = classifyStage(s, roles);
    if (klass === 'writer' && s.kind === 'agent') {
      return s.agent;
    }

    if (klass === 'writer_group' && s.kind === 'group') {
      return firstCheckAgent(s.members.map((m) => ({ id: m.id, stage: m })));
    }
  }

  return undefined;
}

/**
 * The agent the ticket's next run uses; the implementer stands in when the stage's agent cannot
 * run. For one member of a parallel group, `member` picks that member's agent.
 */
export async function peekAgent(
  view: { readonly config: TickConfig },
  tx: StorageTx,
  ticket: Ticket,
  slug: string,
  member?: string,
): Promise<ResolvedAgent> {
  const { config } = view;
  const state = await readStageState(tx, ticket.id);
  let agentId: string | undefined;
  if (state) {
    const cur = state.cursor;
    agentId =
      cur.kind === 'run_writer'
        ? cur.stage.agent
        : cur.kind === 'run_checks' || cur.kind === 'run_writers'
          ? memberAgent(cur.members, member)
          : undefined;
  } else {
    const roster = agentViews(config, slug);
    const roles = Object.fromEntries(roster.map((v) => [v.id, v.definition.role]));
    const def = effectivePipelines(
      config.forge.pipelines,
      projectSettings(config, slug).pipelines,
      roster,
    )[ticket.lane].definition;

    agentId = firstWriterAgent(def.stages, roles);
  }

  return (
    (agentId === undefined ? null : resolveStageAgent(config, slug, agentId)) ??
    resolveAgent(config, slug, ticket.lane)
  );
}
