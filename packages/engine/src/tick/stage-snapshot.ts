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
 *   heavier lane's copy and keeps the passes whose stage ids still exist. The Director's changes ride on top of
 *   that copy and nowhere else: the approved plan's ops for the ticket are applied once, at the first
 *   snapshot, and the ops already applied are re-applied onto a heavier lane's copy, both through the one door
 *   (tick/pipeline-adjust), which drops what no longer holds and never parks the ticket. The copy keeps the
 *   hash of the list before any change (`base_hash`), and a proposal to change the project's list may follow
 *   (tick/pipeline-proposals).
 *
 * Exports: ensureSnapshotTx().
 * Depends on: @forge/core (effectivePipelines, pipelineProblems, routeStages, adoptLegacy), tick/plan-keys,
 *   tick/pipeline-adjust, tick/pipeline-proposals, tick/planning-state, tick/run-agent, tick/tick-config,
 *   shared/time. Writes inside the caller's transaction.
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
import type {
  Lane,
  PipelineAdjustOp,
  RoutedStage,
  StorageTx,
  Ticket,
  TicketPipeline,
} from '@forge/core';
import { adjustTicketPipelineTx, declineAdjustmentsTx } from '#/tick/pipeline-adjust.js';
import { maybeProposeTx } from '#/tick/pipeline-proposals.js';
import { planEntryOf } from '#/tick/plan-keys.js';
import { directorFor } from '#/tick/planning-state.js';
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

  // The one-family rule for a critic is a save-time rule: a ticket never parks because a second
  // harness was connected after its pipeline was saved.
  const problems = pipelineProblems(base, { roster, lane, families_available: [] });
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

  const hash = pipelineHash(routed.definition);

  return {
    ticket_id: ticket.id,
    lane,
    definition: routed.definition,
    roles,
    hash,
    base_hash: hash,
    config_version: configVersionRef(ctx.config, slug),
    routed: stages,
    adjustments: [],
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

  const adopt = (stage: string, member: string, agent: string) => ({
    stage_id: stage,
    member_id: member,
    cycle: 0,
    kind: 'agent' as const,
    agent_id: agent,
    status: 'adopted' as const,
  });

  const seeds = [
    ...adoptLegacy(ticket, snapshot),
    ...stages.flatMap((s, i) => {
      if (i >= reached) {
        return [];
      }

      const klass = classifyStage(s, snapshot.roles);
      if (s.kind === 'agent' && klass === 'writer') {
        return [adopt(s.id, '', s.agent)];
      }

      // Every member of an earlier group of writers is past too.
      return s.kind === 'group' && klass === 'writer_group'
        ? s.members.flatMap((m) =>
            m.kind === 'agent' ? [adopt(s.id, m.id, m.agent)] : [],
          )
        : [];
    }),
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
 * Puts the Director's changes on a fresh copy: the approved plan's ops for a first snapshot, or the ops the
 * earlier copy had applied (plan ones, then fallback ones) for a heavier lane. Each goes through the one door,
 * which drops what no longer holds. With the owner's switch off the ops are only recorded as dropped.
 */
async function applyDirectorOps(
  tx: StorageTx,
  ctx: EngineCtx,
  ticket: Ticket,
  snapshot: TicketPipeline,
  earlier: TicketPipeline | null,
): Promise<TicketPipeline> {
  const slug = (await tx.projects.get(ticket.project))?.slug ?? ticket.project;
  const on = directorFor(ctx, slug).director.pipelines.adjust;
  const batches: {
    cause: 'plan' | 'fallback';
    version?: number;
    ops: PipelineAdjustOp[];
  }[] = [];

  if (earlier) {
    for (const cause of ['plan', 'fallback'] as const) {
      const kept = earlier.adjustments.filter(
        (a) => a.status === 'applied' && a.cause === cause,
      );

      const version = kept.find((a) => a.plan_version !== undefined)?.plan_version;
      batches.push({
        cause,
        ...(version === undefined ? {} : { version }),
        ops: kept.map((a) => a.op),
      });
    }
  } else {
    const planned = await planEntryOf(tx, ticket);
    batches.push({
      cause: 'plan',
      ...(planned ? { version: planned.version } : {}),
      ops: planned?.entry.pipeline?.ops ?? [],
    });
  }

  let current = snapshot;
  for (const b of batches.filter((x) => x.ops.length > 0)) {
    current = on
      ? await adjustTicketPipelineTx(tx, ctx, ticket, b.ops, b.cause, b.version)
      : await declineAdjustmentsTx(
          tx,
          ctx,
          ticket,
          b.ops,
          b.cause,
          b.version,
          'the Director may not change ticket pipelines (switched off in Director settings)',
        );
  }

  return current;
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
    const adjusted = await applyDirectorOps(tx, ctx, ticket, next, existing);
    await maybeProposeTx(tx, ctx, ticket, adjusted);

    return adjusted;
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
  const adjusted = await applyDirectorOps(tx, ctx, ticket, snapshot, null);
  await maybeProposeTx(tx, ctx, ticket, adjusted);

  return adjusted;
}
