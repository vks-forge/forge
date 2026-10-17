/**
 * Stage records: the one place stage attempts are started, finished and closed.
 *
 * Why: the stage runner has no cursor of its own; the rows of `stage_runs` are the account of a
 *   ticket's pipeline, so how they are written is what keeps a restart or a double tick from
 *   starting a stage twice. An attempt is unique per (ticket, stage, member, cycle): starting one
 *   that already exists is a no-op unless it is the same attempt coming back (a running one after
 *   a restart, one that ended in an error), in which case it is linked to the new run instead of
 *   duplicated. The human stage's rows live here too: it waits while the owner reviews, passes
 *   when they approve and fails when they send the work back, and a send-back on a pipeline with
 *   no human stage is recorded against the merge stage so the next cycle still restarts at the
 *   writer. Everything runs inside the caller's transaction.
 *
 * Exports: beginStageRun(), finishStageRun(), recordStage(), humanStageId(), holdForHuman(),
 *   approveHuman(), sendBackFromHuman(), requestStageWake().
 * Depends on: @forge/core (currentCycle, stage types), tick/wakes, types/stage-runner. Writes inside the caller's transaction.
 */

import { currentCycle } from '@forge/core';
import type {
  StageOutcome,
  StageRun,
  StageRunStatus,
  StorageTx,
  TicketId,
  TicketPipeline,
} from '@forge/core';
import { requestWakeTx } from '#/tick/wakes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { AttemptKey } from '#/types/stage-runner.types.js';

/**
 * Starts the attempt `key` as running, or takes over a running or errored one for the new run.
 * Returns its row id, or null when the attempt already ended in a state that must not restart.
 */
export async function beginStageRun(
  tx: StorageTx,
  nowIso: string,
  key: AttemptKey,
): Promise<number | null> {
  const id = await tx.stageRuns.start({
    ...key,
    ticket_id: key.ticket_id as TicketId,
    status: 'running',
    started_at: nowIso,
  });

  if (id !== 'exists') {
    return id;
  }

  const row = await tx.stageRuns.find(
    key.ticket_id,
    key.stage_id,
    key.member_id,
    key.cycle,
  );

  if (!row || (row.status !== 'running' && row.status !== 'error')) {
    return null;
  }

  await tx.stageRuns.finish(row.id, {
    status: 'running',
    ...(key.run_id === undefined ? {} : { run_id: key.run_id }),
    ...(key.agent_id === undefined ? {} : { agent_id: key.agent_id }),
    ...(key.agent_hash === undefined ? {} : { agent_hash: key.agent_hash }),
    started_at: nowIso,
    ended_at: null,
  });

  return row.id;
}

/** Closes attempt `id` with `status` and `outcome`. */
export async function finishStageRun(
  tx: StorageTx,
  id: number,
  status: StageRunStatus,
  outcome: StageOutcome,
  nowIso: string,
): Promise<void> {
  await tx.stageRuns.finish(id, { status, outcome, ended_at: nowIso });
}

/** Records an attempt that is already over (a gate that just passed); an existing one is left alone. */
export async function recordStage(
  tx: StorageTx,
  nowIso: string,
  key: AttemptKey,
  status: StageRunStatus,
  outcome: StageOutcome,
): Promise<number | null> {
  const id = await tx.stageRuns.start({
    ...key,
    ticket_id: key.ticket_id as TicketId,
    status,
    outcome,
    started_at: nowIso,
  });

  if (id === 'exists') {
    return null;
  }

  await tx.stageRuns.finish(id, { ended_at: nowIso });

  return id;
}

/** The id of the pipeline's human stage; a pipeline with none answers `merge`, which then stands in for it. */
export function humanStageId(snapshot: Pick<TicketPipeline, 'definition'>): string {
  return snapshot.definition.stages.find((s) => s.kind === 'human')?.id ?? 'merge';
}

async function humanRow(
  tx: StorageTx,
  ticketId: string,
): Promise<{
  snapshot: TicketPipeline;
  cycle: number;
  stageId: string;
  row: StageRun | null;
} | null> {
  const snapshot = await tx.ticketPipelines.get(ticketId);
  if (!snapshot) {
    return null;
  }

  const cycle = currentCycle(await tx.stageRuns.listByTicket(ticketId));
  const stageId = humanStageId(snapshot);

  return {
    snapshot,
    cycle,
    stageId,
    row: await tx.stageRuns.find(ticketId, stageId, '', cycle),
  };
}

/** The pipeline has a human stage and the work reached it: the owner's review begins (a `waiting` row). */
export async function holdForHuman(
  tx: StorageTx,
  nowIso: string,
  ticketId: string,
): Promise<void> {
  const h = await humanRow(tx, ticketId);
  if (!h || h.stageId === 'merge') {
    return;
  }

  await recordStage(
    tx,
    nowIso,
    {
      ticket_id: ticketId,
      stage_id: h.stageId,
      member_id: '',
      cycle: h.cycle,
      kind: 'human',
    },
    'waiting',
    { note: 'waiting for your review' },
  );
}

/** The owner approved: the human stage passes. */
export async function approveHuman(
  tx: StorageTx,
  nowIso: string,
  ticketId: string,
): Promise<void> {
  const h = await humanRow(tx, ticketId);
  if (!h || h.stageId === 'merge') {
    return;
  }

  if (h.row?.status === 'waiting') {
    await finishStageRun(tx, h.row.id, 'passed', { note: 'approved' }, nowIso);

    return;
  }

  await recordStage(
    tx,
    nowIso,
    {
      ticket_id: ticketId,
      stage_id: h.stageId,
      member_id: '',
      cycle: h.cycle,
      kind: 'human',
    },
    'passed',
    { note: 'approved' },
  );
}

/** The owner sent finished work back: the cycle ends, so the next one restarts at the writer. */
export async function sendBackFromHuman(
  tx: StorageTx,
  nowIso: string,
  ticketId: string,
): Promise<void> {
  const h = await humanRow(tx, ticketId);
  if (!h) {
    return;
  }

  const outcome = { note: 'sent back by the owner' };
  if (h.row?.status === 'waiting') {
    await finishStageRun(tx, h.row.id, 'failed', outcome, nowIso);

    return;
  }

  await recordStage(
    tx,
    nowIso,
    {
      ticket_id: ticketId,
      stage_id: h.stageId,
      member_id: '',
      cycle: h.cycle,
      kind: 'human',
    },
    'failed',
    outcome,
  );
}

/**
 * Queues a `stage` wake for the stage that should start next (a writer, or the checks of a
 * verifying ticket). The key carries the number of runs the ticket has had, so the wake that
 * asked for a start already consumed can never swallow the one a retry asks for, while a repeated
 * request in the same tick coalesces. `notBefore` (epoch ms) delays it (a backoff, a quota reset).
 */
export async function requestStageWake(
  ctx: EngineCtx,
  tx: StorageTx,
  ticketId: string,
  stageId: string,
  cycle: number,
  reason: string,
  notBefore?: number,
): Promise<void> {
  const runs = (await tx.runs.listByTicket(ticketId)).length;
  await requestWakeTx(tx, ctx.deps, {
    ticketId,
    kind: 'stage',
    reason,
    key: `${ticketId}:${stageId}:${cycle}:${runs}`,
    ...(notBefore === undefined ? {} : { notBefore }),
  });
}
