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
 * Exports: peekAgent(), firstCheckAgent().
 * Depends on: @forge/core (effectivePipelines, classifyStage), tick/run-agent, tick/stage-state,
 *   tick/tick-config. Reads storage.
 */

import { classifyStage, effectivePipelines } from '@forge/core';
import type { CheckMember, StorageTx, Ticket } from '@forge/core';
import { agentViews, resolveAgent, resolveStageAgent } from '#/tick/run-agent.js';
import { readStageState } from '#/tick/stage-state.js';
import { projectSettings } from '#/tick/tick-config.js';
import type { ResolvedAgent } from '#/types/run-agent.types.js';
import type { TickConfig } from '#/types/tick.types.js';

/** The agent id of the first agent among the members to start, if any. */
export const firstCheckAgent = (members: readonly CheckMember[]): string | undefined =>
  members.flatMap((m) => (m.stage.kind === 'agent' ? [m.stage.agent] : []))[0];

/** The agent the ticket's next run uses; the implementer stands in when the stage's agent cannot run. */
export async function peekAgent(
  view: { readonly config: TickConfig },
  tx: StorageTx,
  ticket: Ticket,
  slug: string,
): Promise<ResolvedAgent> {
  const { config } = view;
  const state = await readStageState(tx, ticket.id);
  let agentId: string | undefined;
  if (state) {
    const cur = state.cursor;
    agentId =
      cur.kind === 'run_writer'
        ? cur.stage.agent
        : cur.kind === 'run_checks'
          ? firstCheckAgent(cur.members)
          : undefined;
  } else {
    const roster = agentViews(config, slug);
    const roles = Object.fromEntries(roster.map((v) => [v.id, v.definition.role]));
    const def = effectivePipelines(
      config.forge.pipelines,
      projectSettings(config, slug).pipelines,
      roster,
    )[ticket.lane].definition;

    const first = def.stages.find(
      (s) => s.kind === 'agent' && classifyStage(s, roles) === 'writer',
    );

    agentId = first?.kind === 'agent' ? first.agent : undefined;
  }

  return (
    (agentId === undefined ? null : resolveStageAgent(config, slug, agentId)) ??
    resolveAgent(config, slug, ticket.lane)
  );
}
