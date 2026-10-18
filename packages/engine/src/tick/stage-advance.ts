/**
 * Stage advance (in-progress side): what follows a finished writer, and the red proof.
 *
 * Why: when a writer's stage passes, the ticket either has another writer to run (a `stage` wake
 *   starts it while the ticket stays In Progress), a red proof to run first, or is done writing
 *   and moves to Verifying. A group of writers is several Workers at once: each member that has not
 *   started gets a wake of its own, every tick, even while a sibling's run is live, so the
 *   scheduler starts them as the Worker limits allow and a restart loses none. The red proof is the
 *   check that a test-writer's new tests really fail before the implementation exists (d-0015); it
 *   runs the project's test command on the worktree through the script runner, beside the tick, and
 *   is advisory: tests that already pass are reported to the next reviewer and noted on the card,
 *   never a block. A project with no test command, or a server with no runner, skips the proof
 *   with a note. Every tick this phase finds in-progress tickets with a proof due or finished, so a
 *   restart resumes it.
 *
 * Exports: advanceStagesTx(), advanceStages().
 * Depends on: @forge/core (stageCursor, currentCycle), tick/{project-runtime,stage-proof,stage-records,
 *   stage-script-jobs,stage-state,ticket-moves}, types/stage-runner. IO: git worktree, the script runner.
 */

import { currentCycle, stageCursor } from '@forge/core';
import type { AgentStage, StorageTx, Ticket, TicketPipeline } from '@forge/core';
import { FAR_FUTURE } from '#/shared/time.js';
import { baseRefFor, runtimeFor } from '#/tick/project-runtime.js';
import { finishProof, testCheck } from '#/tick/stage-proof.js';
import { beginStageRun, finishStageRun, requestStageWake } from '#/tick/stage-records.js';
import {
  hasJob,
  startScriptJob,
  stageJobKey,
  takeFinishedJob,
} from '#/tick/stage-script-jobs.js';
import { readStageState } from '#/tick/stage-state.js';
import { moveTicketTx } from '#/tick/ticket-moves.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** A red proof gets as long as a normal project test run. */
const PROOF_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * After a writer passed (or a proof ended): ask for the next writer or proof by a wake, or move
 * the ticket to Verifying when it is done writing. Returns what happened.
 */
export async function advanceStagesTx(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Ticket,
  snapshot: TicketPipeline,
): Promise<'waiting' | 'verifying' | 'blocked'> {
  const records = await tx.stageRuns.listByTicket(ticket.id);
  const cycle = currentCycle(records);
  const cursor = stageCursor(snapshot, records, cycle);
  if (cursor.kind === 'run_writer' || cursor.kind === 'run_proof') {
    // The wake keeps the ticket explained while the next writer, or the proof, is not yet running.
    await requestStageWake(
      ctx,
      tx,
      ticket.id,
      cursor.stage.id,
      cycle,
      `stage:${cursor.stage.id}`,
    );

    return 'waiting';
  }

  if (cursor.kind === 'run_writers') {
    // Each member that has not started has a wake of its own, so the scheduler places it against
    // the Worker limits: both start at once when there is room, one after the other when not.
    for (const m of cursor.members) {
      await requestStageWake(
        ctx,
        tx,
        ticket.id,
        cursor.stage.id,
        cycle,
        `stage:${cursor.stage.id}`,
        undefined,
        m.id,
      );
    }

    return 'waiting';
  }

  if (cursor.kind === 'await') {
    return 'waiting';
  }

  const moved = await moveTicketTx(tx, ticket.id, ctx.nowIso, (cur) =>
    cur.status === 'in_progress' ? { events: [{ type: 'verifying' }] } : null,
  );

  if (!moved.ok) {
    ctx.deps.log?.('warn', 'success did not move the ticket', { reason: moved.reason });

    return 'blocked';
  }

  // The stage wakes that kept the ticket explained while it wrote have done their job.
  for (const w of await tx.wakeRequests.listDue(FAR_FUTURE)) {
    if (w.ticket_id === ticket.id && w.kind === 'stage') {
      await tx.wakeRequests.markConsumed(w.id, ctx.nowIso);
    }
  }

  return 'verifying';
}

/** One in-progress ticket whose pipeline asks for a red proof: apply a finished one, skip or start one. */
async function advanceOne(ctx: EngineCtx, ticket: Ticket, live: boolean): Promise<void> {
  const { deps } = ctx;
  const state = await deps.storage.transaction((tx) => readStageState(tx, ticket.id));
  if (!state) {
    return;
  }

  const { cursor } = state;
  // A run is live: only a writer group still has something to do (its other members start beside it).
  if (live && cursor.kind !== 'run_writers') {
    return;
  }

  // A proof is due (`run_proof`) or running (`await` on a tester stage that asks for one).
  const proving =
    cursor.kind === 'run_proof' ||
    (cursor.kind === 'await' &&
      cursor.stage.kind === 'agent' &&
      cursor.stage.proof === 'red');

  if (!proving) {
    // A proof that just ended can leave the ticket done writing; a stale wake must not strand it.
    if (cursor.kind !== 'run_writer' && cursor.kind !== 'await') {
      await deps.storage.transaction((tx) =>
        advanceStagesTx(ctx, tx, ticket, state.snapshot),
      );
    }

    return;
  }

  const stage = cursor.stage as AgentStage;
  const writerRow = state.records.find(
    (r) => r.stage_id === stage.id && r.member_id === '' && r.cycle === cursor.cycle,
  );

  const slug = (await deps.storage.transaction((tx) => tx.projects.get(ticket.project)))
    ?.slug;

  const runtime = slug ? runtimeFor(ctx, slug) : null;
  const check = slug ? testCheck(ctx, slug) : undefined;
  const runId = writerRow?.run_id ?? ticket.assignee_run_id ?? 'run';
  const key = stageJobKey(ticket.id, runId, stage.id, 'proof');
  const { cycle } = cursor;

  const finished = takeFinishedJob(ctx, key);
  if (finished) {
    await deps.storage.transaction(async (tx) => {
      await finishProof(
        ctx,
        tx,
        ticket,
        state.snapshot,
        finished.job.stageRunId,
        finished.outcome,
      );

      await advanceStagesTx(ctx, tx, ticket, state.snapshot);
    });

    return;
  }

  if (hasJob(ctx, key)) {
    return;
  }

  const attempt = {
    ticket_id: ticket.id,
    stage_id: stage.id,
    member_id: 'proof',
    cycle,
    kind: 'script_gate' as const,
    run_id: runId,
  };

  if (!runtime || !ticket.worktree || !ticket.branch || !check || !runtime.scriptGates) {
    // Advisory: nothing to run the proof with, so the proof is skipped and work goes on.
    await deps.storage.transaction(async (tx) => {
      const id = await beginStageRun(tx, ctx.nowIso, attempt);
      if (id !== null) {
        await finishStageRun(
          tx,
          id,
          'skipped',
          { note: 'no test command or script runner, so no red proof' },
          ctx.nowIso,
        );
      }

      await advanceStagesTx(ctx, tx, ticket, state.snapshot);
    });

    return;
  }

  const { scriptGates } = runtime;
  const wt = await runtime.worktrees.create(
    ticket.id,
    ticket.branch,
    baseRefFor(ctx, slug as string),
  );

  const rowId = await deps.storage.transaction((tx) =>
    beginStageRun(tx, ctx.nowIso, attempt),
  );

  if (rowId === null) {
    return;
  }

  startScriptJob(
    ctx,
    key,
    { ticketId: ticket.id, stageRunId: rowId, purpose: 'proof' },
    () =>
      scriptGates.run({
        worktreePath: wt.path,
        baseSha: wt.baseSha,
        command: check.command,
        ...(check.cwd === undefined ? {} : { cwd: check.cwd }),
        timeoutMs: PROOF_TIMEOUT_MS,
        guardPaths: [],
        expect: 'fail',
      }),
  );
}

/** Phase: advances every in-progress ticket whose pipeline asks for, or just finished, a red proof. */
export async function advanceStages(ctx: EngineCtx): Promise<void> {
  const tickets = await ctx.deps.storage.transaction((tx) =>
    tx.tickets.listByStatus('in_progress'),
  );

  for (const ticket of tickets) {
    const live = Boolean(
      ticket.assignee_run_id && ctx.state.pumps.has(ticket.assignee_run_id),
    );

    try {
      await advanceOne(ctx, ticket, live);
    } catch (e) {
      ctx.report.errors.push({
        where: `advance ${ticket.id}`,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
