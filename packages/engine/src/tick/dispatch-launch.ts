/**
 * Launches a briefed Worker run in the tick: re-check the ticket, start the harness, move the ticket.
 *
 * Why: the brief job takes seconds to minutes, and the world moves meanwhile: the owner may cancel
 *   the ticket, answer or retry it by another door, or the pipeline may have moved to another stage.
 *   Starting a Worker from a brief written for a ticket that no longer wants one would spend budget
 *   on cancelled work or run two writers at once. So before the harness starts, the candidate is
 *   checked again against the rows as they are now (its wake still due and still applicable, the
 *   same writer still due) and a brief that no longer fits is dropped; for a ticket that was
 *   cancelled, the worktree the brief cut is removed with it. The run row, token and driver start go
 *   through `launchRun`, and the ticket moves to `in_progress` only once the harness accepted the run,
 *   stamped with the spawn time, however long the brief took (d-0055, d-0092: a resume is a new run).
 *
 * Exports: launchBriefed().
 * Depends on: @forge/core (TERMINAL_STATUSES, Ticket), shared/time, tick/{dispatch-stage,launch-run,
 *   stage-records,ticket-moves,wake-candidates,workspace-cleanup}, types/dispatch-start. IO: storage, the driver.
 */

import { TERMINAL_STATUSES } from '@forge/core';
import type { Ticket, TicketId } from '@forge/core';
import { FAR_FUTURE } from '#/shared/time.js';
import { chooseWriter } from '#/tick/dispatch-stage.js';
import { launchRun } from '#/tick/launch-run.js';
import { beginStageRun } from '#/tick/stage-records.js';
import { moveTicket } from '#/tick/ticket-moves.js';
import { classifyWake } from '#/tick/wake-candidates.js';
import { cleanWorkspace } from '#/tick/workspace-cleanup.js';
import type { Launchable, StartPlan } from '#/types/dispatch-start.types.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/**
 * The ticket as it is now when the candidate still holds, else null. A wake-driven start needs its
 * wake still due and still classified the same; a new ticket must still be planned.
 */
async function stillWanted(ctx: EngineCtx, plan: StartPlan): Promise<Ticket | null> {
  const { candidate: c } = plan;
  const { deps } = ctx;
  const ticket = await deps.storage.transaction((tx) => tx.tickets.get(c.ticket.id));
  if (!ticket || TERMINAL_STATUSES.includes(ticket.status)) {
    return null;
  }

  if (c.wake === undefined) {
    return ticket.status === 'planned' ? ticket : null;
  }

  const wake = c.wake;
  const again = await deps.storage.transaction(async (tx) => {
    const due = (await tx.wakeRequests.listDue(FAR_FUTURE)).some((w) => w.id === wake.id);

    return due ? classifyWake(ctx, tx, wake, false) : null;
  });

  return again !== null && again.kind === c.kind && again.member === c.member
    ? ticket
    : null;
}

/** True when the writer due now is the one the brief was written for. */
async function sameWriter(
  ctx: EngineCtx,
  plan: StartPlan,
  ticket: Ticket,
): Promise<boolean> {
  const choice = await chooseWriter(
    ctx,
    ticket,
    plan.project.slug,
    plan.previous,
    plan.candidate.member,
  );

  return (
    choice.kind === 'go' &&
    choice.agent.id === plan.agent.id &&
    choice.stage?.id === plan.stage?.id &&
    choice.memberId === plan.memberId &&
    choice.state?.cycle === plan.state?.cycle
  );
}

/** Removes the worktree a brief cut for a ticket that ended meanwhile; never throws. */
async function dropWorkspace(
  ctx: EngineCtx,
  plan: StartPlan,
  ticketId: string,
  path: string,
): Promise<void> {
  const ticket = await ctx.deps.storage.transaction((tx) =>
    tx.tickets.get(ticketId as TicketId),
  );

  if (ticket && TERMINAL_STATUSES.includes(ticket.status)) {
    await cleanWorkspace(ctx.deps, ctx.state, {
      ...ticket,
      worktree: ticket.worktree ?? path,
      branch: ticket.branch ?? plan.branch,
    });
  }
}

/** Starts the run for a brief; true when a run is now live. A brief that no longer fits is dropped and its wake stays due. */
export async function launchBriefed(
  ctx: EngineCtx,
  plan: StartPlan,
  briefed: Launchable,
): Promise<boolean> {
  const { deps } = ctx;
  const { candidate: c, agent, stage, state, driver, branch } = plan;
  const { wt, prompt, pathPrepend } = briefed;
  const ticket = await stillWanted(ctx, plan);
  if (!ticket || !(await sameWriter(ctx, plan, ticket))) {
    deps.log?.(
      'info',
      `brief for ${c.ticket.id} dropped: the ticket no longer wants a run`,
    );

    await dropWorkspace(ctx, plan, c.ticket.id, wt.path);

    return false;
  }

  const previous = plan.previous;
  const resumeSession =
    // A session belongs to the harness that made it: a fallback harness starts fresh.
    c.kind === 'resume' && driver.capabilities().resume && previous?.harness === driver.id
      ? previous?.session_ref
      : undefined;

  const launched = await launchRun(ctx, {
    ticket,
    agent,
    harness: plan.harness,
    driver,
    wt,
    prompt,
    previous,
    resumeSession,
    wake: c.wake,
    pathPrepend,
    inTx:
      stage && state
        ? async (tx, runId) => {
            await beginStageRun(tx, ctx.nowIso, {
              ticket_id: ticket.id,
              stage_id: stage.id,
              member_id: plan.memberId ?? '',
              cycle: state.cycle,
              kind: 'agent',
              agent_id: agent.id,
              agent_hash: agent.hash,
              run_id: runId,
            });
          }
        : undefined,
  });

  if (!launched) {
    return false;
  }

  const { runId, handle } = launched;
  const fields = { assignee_run_id: runId, branch, worktree: wt.path };
  // The run started just now, however long the worktree and the brief took.
  const moved = await moveTicket(deps.storage, ticket.id, launched.at, (t: Ticket) => {
    if (t.status === 'planned') {
      return {
        events: [{ type: 'dispatched' }],
        fields,
        reason: 'A Worker slot was free, so a Worker started',
      };
    }

    if (t.status === 'waiting_human') {
      return {
        events: [{ type: 'answered' }],
        fields,
        reason: 'You answered, so the Worker resumed',
      };
    }

    if (t.status === 'in_progress') {
      return { events: [], fields };
    }

    return null;
  });

  if (!moved.ok) {
    deps.log?.(
      'error',
      `run ${runId} started but ${ticket.id} could not take it; cancelling`,
      { reason: moved.reason },
    );

    await driver.cancel(handle).catch(() => undefined);

    return false;
  }

  ctx.report.dispatched.push({ ticketId: ticket.id, runId, kind: c.kind });

  return true;
}
