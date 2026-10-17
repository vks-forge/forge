/**
 * Stage snapshot: the ticket's own copy of its lane pipeline, taken once at its first dispatch.
 *
 * Why: an owner may edit a lane's pipeline at any time, and a ticket halfway through must not
 *   change course under its Worker. At its first dispatch the ticket copies the effective lane
 *   pipeline (project override over company over shipped), checks it again against the roster as
 *   it is now (a stage whose agent was archived since the save must stop the ticket visibly, not
 *   run), adds the checks the project's routing rules ask for on the plan's files (only ever
 *   adds, d-0069) and records the pipeline's hash and the settings version it came from. A
 *   ticket that was already past its writers when pipelines went live adopts them, so it is not
 *   asked to write again. If the ticket's lane is raised later, the next stage boundary takes the
 *   heavier lane's copy and keeps the passes whose stage ids still exist.
 *
 * Exports: ensureSnapshotTx().
 * Depends on: @forge/core (effectivePipelines, pipelineProblems, routeStages, adoptLegacy), tick/plan-keys,
 *   tick/run-agent, tick/tick-config, shared/time. Writes inside the caller's transaction.
 */

import {
  InvalidInputError,
  adoptLegacy,
  classifyStage,
  effectivePipelines,
  pipelineHash,
  pipelineProblems,
  routeStages,
} from '@forge/core';
import type { Lane, RoutedStage, StorageTx, Ticket, TicketPipeline } from '@forge/core';
import { planEntryOf } from '#/tick/plan-keys.js';
import { agentViews } from '#/tick/run-agent.js';
import { configVersionRef, projectSettings } from '#/tick/tick-config.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

const RANK: Record<Lane, number> = { express: 0, standard: 1, full: 2 };

/** The pipeline of `lane` as `ticket` would take it now; throws a typed error when it cannot run. */
async function build(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Ticket,
  slug: string,
  lane: Lane,
): Promise<Omit<TicketPipeline, 'created_at' | 'updated_at'>> {
  const settings = projectSettings(ctx.config, slug);
  const roster = agentViews(ctx.config, slug);
  const roles = Object.fromEntries(roster.map((v) => [v.id, v.definition.role]));
  const base = effectivePipelines(ctx.config.forge.pipelines, settings.pipelines, roster)[
    lane
  ].definition;

  const problems = pipelineProblems(base, { roster, lane });
  if (problems.length > 0) {
    throw new InvalidInputError(
      `the ${lane} pipeline of project ${slug} cannot run: ${problems.map((p) => p.message).join('; ')}. Fix it in Pipelines settings, then retry.`,
    );
  }

  const files = (await planEntryOf(tx, ticket))?.entry.files ?? [];
  const routed = routeStages(base, settings.pipelines?.routing ?? [], files, roles);
  const stages: RoutedStage[] = routed.fired.map((f) => ({
    ...f,
    at: 'snapshot' as const,
  }));

  return {
    ticket_id: ticket.id,
    lane,
    definition: routed.definition,
    roles,
    hash: pipelineHash(routed.definition),
    config_version: configVersionRef(ctx.config, slug),
    routed: stages,
  };
}

/**
 * Records the writer stages `ticket` is already past as adopted: all of them for a ticket done
 * writing, and for one still writing the writers that sit before a stage that already ran (a lane
 * raised mid-run must not send an earlier writer after a later one). Existing rows stay.
 */
async function adoptWriters(
  tx: StorageTx,
  ctx: EngineCtx,
  ticket: Ticket,
  snapshot: TicketPipeline,
): Promise<void> {
  const { stages } = snapshot.definition;
  const rows = await tx.stageRuns.listByTicket(ticket.id);
  const reached = Math.max(
    -1,
    ...rows.map((r) => stages.findIndex((s) => s.id === r.stage_id)),
  );

  const earlier = stages.flatMap((s, i) =>
    i < reached && s.kind === 'agent' && snapshot.roles[s.agent] !== undefined
      ? [{ stage: s, writer: classifyStage(s, snapshot.roles) === 'writer' }]
      : [],
  );

  const seeds = [
    ...adoptLegacy(ticket, snapshot),
    ...earlier.flatMap(({ stage, writer }) =>
      writer && stage.kind === 'agent'
        ? [
            {
              stage_id: stage.id,
              member_id: '',
              cycle: 0,
              kind: 'agent' as const,
              agent_id: stage.agent,
              status: 'adopted' as const,
            },
          ]
        : [],
    ),
  ];

  for (const seed of seeds) {
    const id = await tx.stageRuns.start({
      ticket_id: ticket.id,
      ...seed,
      ...(ticket.assignee_run_id === undefined ? {} : { run_id: ticket.assignee_run_id }),
      started_at: ctx.nowIso,
    });

    if (id !== 'exists') {
      await tx.stageRuns.finish(id, { ended_at: ctx.nowIso });
    }
  }
}

/**
 * The ticket's pipeline snapshot, taking it first if it has none (adopting writers for a ticket
 * already past them) and re-taking it when the ticket's lane was raised since. Throws
 * `InvalidInputError` when the lane's pipeline cannot run under the roster as it is now.
 */
export async function ensureSnapshotTx(
  tx: StorageTx,
  ctx: EngineCtx,
  ticket: Ticket,
): Promise<TicketPipeline> {
  const existing = await tx.ticketPipelines.get(ticket.id);
  if (existing && RANK[ticket.lane] <= RANK[existing.lane]) {
    return existing;
  }

  const slug = (await tx.projects.get(ticket.project))?.slug ?? ticket.project;
  const built = await build(ctx, tx, ticket, slug, ticket.lane);

  if (existing) {
    const next: TicketPipeline = {
      ...built,
      created_at: existing.created_at,
      updated_at: ctx.nowIso,
    };

    await tx.ticketPipelines.replace(next);
    // A ticket already past its writers is not asked to write the heavier lane's earlier stages.
    await adoptWriters(tx, ctx, ticket, next);

    return next;
  }

  const snapshot: TicketPipeline = {
    ...built,
    created_at: ctx.nowIso,
    updated_at: ctx.nowIso,
  };

  if (!(await tx.ticketPipelines.insert(snapshot))) {
    return (await tx.ticketPipelines.get(ticket.id)) ?? snapshot;
  }

  await adoptWriters(tx, ctx, ticket, snapshot);

  return snapshot;
}
