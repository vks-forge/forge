/**
 * The one door for a ticket's pipeline copy: every change after its first snapshot goes through here.
 *
 * Why: the Director may tailor a ticket's own pipeline (from the approved plan at the first dispatch, again
 *   when a heavier lane re-snapshots, and by a swap when an agent cannot run), but only through the pure rules
 *   of core `applyAdjustments`: merge, G1, every script gate, a person's step and a routing rule's stage are
 *   locked, a swap keeps the role and never widens a writer's scope, and the result must still pass the
 *   pipeline rules (d-0149, d-0151). This door reads the copy and the stage rows, freezes every stage that is
 *   running or already passed in the current cycle (a ticket never changes course under its Worker), applies
 *   the ops and stores the new definition, its hash, the roles of any agent the change brought in and the full
 *   adjustment log in one write. A refused op is logged `dropped` with its reason and never throws, so a
 *   change the rules refuse can never park a ticket. The card gets one note saying what changed and what was
 *   dropped, so the owner sees the Director's act where they read the card.
 *
 * Exports: adjustTicketPipelineTx(), declineAdjustmentsTx(), frozenStages(), describeOp().
 * Depends on: @forge/core (applyAdjustments, cursor helpers, pipelineHash), tick/{card-log,lane-pipeline,run-agent}.
 *   Writes inside the caller's transaction.
 */

import {
  InvalidInputError,
  MAX_ADJUSTMENTS,
  adjustmentKey,
  applyAdjustments,
  currentCycle,
  cycleStart,
  flattenStages,
  pipelineHash,
} from '@forge/core';
import type {
  PipelineAdjustOp,
  PipelineAdjustment,
  StageRun,
  StorageTx,
  Ticket,
  TicketPipeline,
} from '@forge/core';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import { adjustContext } from '#/tick/lane-pipeline.js';
import { agentViews } from '#/tick/run-agent.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

const LIVE = ['running', 'passed', 'adopted', 'skipped', 'waiting'] as const;

/** Ids of the top-level stages the copy may no longer change: satisfied above the cycle's start, or live in this cycle. */
export function frozenStages(
  snapshot: Pick<TicketPipeline, 'definition' | 'roles'>,
  records: readonly StageRun[],
): string[] {
  const cycle = currentCycle(records);
  const start = cycleStart(snapshot, records, cycle);
  const above = snapshot.definition.stages.slice(0, start).map((s) => s.id);
  const live = records
    .filter((r) => r.cycle === cycle && (LIVE as readonly string[]).includes(r.status))
    .map((r) => r.stage_id);

  return [...new Set([...above, ...live])];
}

/** One op in a short phrase, for the card note and the escalation. */
export function describeOp(op: PipelineAdjustOp): string {
  switch (op.op) {
    case 'add':
      return `added ${op.stage.kind === 'agent' ? op.stage.agent : op.stage.label} after ${op.after}`;
    case 'remove':
      return `removed ${op.stage_id}`;
    case 'swap':
      return `swapped ${op.member_id ?? op.stage_id} to ${op.agent}`;
    case 'move':
      return `moved ${op.stage_id} after ${op.after}`;
  }
}

const noteOf = (
  ticketId: string,
  cause: PipelineAdjustment['cause'],
  log: readonly PipelineAdjustment[],
): string => {
  const applied = log.filter((l) => l.status === 'applied');
  const dropped = log.filter((l) => l.status === 'dropped');
  const parts: string[] = [];
  if (applied.length > 0) {
    parts.push(
      `${cause === 'fallback' ? 'switched agent' : 'changed the pipeline'}: ${applied
        .map((l) => `${describeOp(l.op)} (${l.op.reason})`)
        .join('; ')}`,
    );
  }

  if (dropped.length > 0) {
    parts.push(
      `could not apply: ${dropped.map((l) => `${describeOp(l.op)} (${l.problem ?? 'refused'})`).join('; ')}`,
    );
  }

  return `The Director ${parts.join('. It ')} on ${ticketId}.`;
};

/**
 * Applies `ops` to the ticket's pipeline copy and stores the result; returns the stored copy. Throws only when
 * the ticket has no copy yet (a caller bug), never because an op was refused.
 */
export async function adjustTicketPipelineTx(
  tx: StorageTx,
  ctx: EngineCtx,
  ticket: Ticket,
  ops: readonly PipelineAdjustOp[],
  cause: PipelineAdjustment['cause'],
  planVersion?: number,
): Promise<TicketPipeline> {
  const snapshot = await tx.ticketPipelines.get(ticket.id);
  if (!snapshot) {
    throw new InvalidInputError(`ticket ${ticket.id} has no pipeline copy to adjust`);
  }

  if (ops.length === 0) {
    return snapshot;
  }

  const slug = (await tx.projects.get(ticket.project))?.slug ?? ticket.project;
  const roster = agentViews(ctx.config, slug);
  const records = await tx.stageRuns.listByTicket(ticket.id);
  const result = applyAdjustments(
    snapshot.definition,
    ops,
    adjustContext(
      roster,
      snapshot.lane,
      snapshot.routed.map((r) => r.stage_id),
      frozenStages(snapshot, records),
    ),
    {
      cause,
      at: ctx.nowIso,
      seq: snapshot.adjustments.length,
      ...(planVersion === undefined ? {} : { plan_version: planVersion }),
    },
  );

  const adjustments = [...snapshot.adjustments, ...result.log].slice(-MAX_ADJUSTMENTS);
  const hash = pipelineHash(result.definition);
  // An agent brought in by an add or a swap needs its role on the copy, or the cursor could not place it.
  const roles = {
    ...snapshot.roles,
    ...Object.fromEntries(
      flattenStages(result.definition).flatMap((s) => {
        const role =
          s.kind === 'agent'
            ? roster.find((v) => v.id === s.agent)?.definition.role
            : undefined;

        return s.kind === 'agent' && role !== undefined && !(s.agent in snapshot.roles)
          ? [[s.agent, role]]
          : [];
      }),
    ),
  };

  await tx.ticketPipelines.adjust(ticket.id, {
    definition: result.definition,
    hash,
    roles,
    adjustments,
    at: ctx.nowIso,
  });

  await logCardEvent(tx, ticket.card_id, {
    kind: 'note',
    at: ctx.nowIso,
    actor: ENGINE_ACTOR,
    payload: { text: noteOf(ticket.id, cause, result.log) },
  });

  return {
    ...snapshot,
    definition: result.definition,
    hash,
    roles,
    adjustments,
    updated_at: ctx.nowIso,
  };
}

/**
 * Records `ops` as dropped for `why` without applying any (the owner switched the Director's pipeline changes
 * off after the plan was approved): the copy keeps its list, the log keeps the honest account.
 */
export async function declineAdjustmentsTx(
  tx: StorageTx,
  ctx: EngineCtx,
  ticket: Ticket,
  ops: readonly PipelineAdjustOp[],
  cause: PipelineAdjustment['cause'],
  planVersion: number | undefined,
  why: string,
): Promise<TicketPipeline> {
  const snapshot = await tx.ticketPipelines.get(ticket.id);
  if (!snapshot) {
    throw new InvalidInputError(`ticket ${ticket.id} has no pipeline copy to adjust`);
  }

  const log: PipelineAdjustment[] = ops.map((op, i) => ({
    seq: snapshot.adjustments.length + i,
    op,
    by: 'director',
    cause,
    key: adjustmentKey(snapshot.lane, op),
    status: 'dropped',
    problem: why,
    ...(planVersion === undefined ? {} : { plan_version: planVersion }),
    at: ctx.nowIso,
  }));

  const adjustments = [...snapshot.adjustments, ...log].slice(-MAX_ADJUSTMENTS);
  await tx.ticketPipelines.adjust(ticket.id, {
    definition: snapshot.definition,
    hash: snapshot.hash,
    adjustments,
    at: ctx.nowIso,
  });

  await logCardEvent(tx, ticket.card_id, {
    kind: 'note',
    at: ctx.nowIso,
    actor: ENGINE_ACTOR,
    payload: { text: noteOf(ticket.id, cause, log) },
  });

  return { ...snapshot, adjustments, updated_at: ctx.nowIso };
}
