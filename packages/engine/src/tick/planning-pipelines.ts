/**
 * Planning pipelines: what the planner is shown about pipelines, and which of its ops hold.
 *
 * Why: the approved plan is where the Director may tailor a ticket's pipeline (d-0149): add a check, drop one
 *   for a trivial change, swap an agent. To do that sensibly the planner must see the three lane pipelines, the
 *   agents it may use with what they may write, which stages are locked and how each agent has done (compact
 *   scorecards, hints and never orders). What it writes back is untrusted (the plan was drafted from repository
 *   text a stranger may have written), so every op is run through core `applyAdjustments` against the ticket's
 *   lane as it is now, when the plan is written: an op the rules refuse is dropped and listed under the plan's
 *   risks ("Pipeline change dropped for t2: ..."), and only the ops that hold stay on the plan, which is what the
 *   owner reads and approves. Ops are checked again at the ticket's first dispatch, when the lane may have moved.
 *
 * Exports: pipelinesInput(), vetPipelineOps(), removalsOf().
 * Depends on: @forge/core (applyAdjustments, isLockedStage, computeScorecards, compactScorecards), tick/{lane-pipeline,
 *   scorecards, pipeline-adjust}, types/card-planning. Reads storage.
 */

import {
  LANES,
  TicketType,
  applyAdjustments,
  compactScorecards,
  computeScorecards,
  isLockedStage,
} from '@forge/core';
import type { PlanTicket } from '@forge/core';
import { describeOp } from '#/tick/pipeline-adjust.js';
import { adjustContext, lanePipeline } from '#/tick/lane-pipeline.js';
import { loadScorecardInput } from '#/tick/scorecards.js';
import type { PlanCtx } from '#/types/card-planning.types.js';

const NO_ROUTED: ReadonlySet<string> = new Set();

/**
 * The `pipelines` block of the `write_plan` input: the lanes, the usable roster, the locked stage ids and the
 * compact scorecards (the `all` row and one per ticket type, over 90 days), plus the method text. With the
 * owner's switch off it only says so, and the planner writes no ops.
 */
export async function pipelinesInput(pc: PlanCtx): Promise<Record<string, unknown>> {
  if (!pc.director.pipelines.adjust) {
    return { adjust: false };
  }

  const slug = pc.project.slug;
  const lanes = Object.fromEntries(
    LANES.map((lane) => [lane, lanePipeline(pc.ctx.config, slug, lane).definition]),
  );

  const { roster } = lanePipeline(pc.ctx.config, slug, 'standard');
  const reply = await pc.ctx.deps.storage.transaction(async (tx) =>
    computeScorecards(
      await loadScorecardInput(tx, {
        project: pc.project.id,
        roster,
        now: pc.ctx.now,
        range: '90d',
      }),
    ),
  );

  const playbook = pc.director.playbooks['adjust-pipeline'];

  return {
    adjust: true,
    playbook: playbook
      ? { id: 'adjust-pipeline', title: playbook.title, body: playbook.body }
      : null,
    lanes,
    locked: Object.fromEntries(
      LANES.map((lane) => [
        lane,
        (lanes[lane] as { stages: Parameters<typeof isLockedStage>[0][] }).stages
          .filter((s) => isLockedStage(s, NO_ROUTED))
          .map((s) => s.id),
      ]),
    ),
    roster: roster
      .filter((v) => !v.tags.includes('disabled') && !v.tags.includes('archived'))
      .map((v) => ({
        id: v.id,
        name: v.definition.name,
        role: v.definition.role,
        description: v.definition.description,
        write_scope: v.definition.write_scope,
      })),
    scorecards: compactScorecards(reply, TicketType.options),
  };
}

/**
 * The plan's tickets with only the pipeline ops that hold on their lane, and a note for every op that was
 * dropped (to go under the plan's risks).
 */
export function vetPipelineOps(
  pc: PlanCtx,
  tickets: readonly PlanTicket[],
  at: string,
): { tickets: PlanTicket[]; notes: string[] } {
  const notes: string[] = [];
  const on = pc.director.pipelines.adjust;
  const out = tickets.map((t): PlanTicket => {
    const ops = t.pipeline?.ops ?? [];
    if (ops.length === 0) {
      return t;
    }

    const { pipeline: _asked, ...rest } = t;
    void _asked;
    if (!on) {
      notes.push(
        `Pipeline change dropped for ${t.key}: the Director may not change ticket pipelines (switched off in Director settings).`,
      );

      return rest;
    }

    const lane = lanePipeline(pc.ctx.config, pc.project.slug, t.lane);
    const result = applyAdjustments(
      lane.definition,
      ops,
      adjustContext(lane.roster, t.lane, []),
      { cause: 'plan', at },
    );

    for (const d of result.dropped) {
      notes.push(
        `Pipeline change dropped for ${t.key}: ${describeOp(d.op)} (${d.problem ?? 'refused'}).`,
      );
    }

    return result.applied.length === 0
      ? rest
      : { ...rest, pipeline: { ops: result.applied.map((a) => a.op) } };
  });

  return { tickets: out, notes };
}

/** The stage ids each planned ticket's pipeline removes: a lighter pipeline than its lane's, which the owner approves. */
export function removalsOf(tickets: readonly Pick<PlanTicket, 'key' | 'pipeline'>[]) {
  return tickets.flatMap((t) => {
    const removed = (t.pipeline?.ops ?? []).flatMap((op) =>
      op.op === 'remove' ? [op.stage_id] : [],
    );

    return removed.length === 0 ? [] : [{ key: t.key, removed }];
  });
}
