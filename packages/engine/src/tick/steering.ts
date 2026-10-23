/**
 * Steering: a user's reply to a running ticket reaches the live Worker.
 *
 * Why: a person watching a run says "also update the docs" or "stop, wrong file". The
 *   Director must turn that into the right kind of delivery (steer between tool calls,
 *   queue as a follow-up, or interrupt) without blocking the intake request on a model
 *   call, and must remember what it delivered. The reply waits for the next tick, the
 *   `steer_reply` step picks the mode and wording, the message is written to the durable
 *   run inbox first (so a crash never loses it), then handed to the driver with its inbox
 *   sequence number, and marked delivered only once the driver took it (director-core.md §8).
 *   The model call runs as a job beside the tick, first in line for a Director slot because a live
 *   Worker is waiting on it; the tick that collects it checks the run is still the one the ticket
 *   holds and still live before delivering, and drops the reply when it is not. A reply that finds
 *   no free slot, or its ticket's job still in flight, stays queued for the next tick, in order.
 *
 * Exports: deliverReplies().
 * Depends on: @forge/core (SteerReplyOutput, WorkerDriver port), steps/run-step, tick/director-jobs.
 */

import { SteerReplyOutput } from '@forge/core';
import type { SteerMode, TicketId } from '@forge/core';
import { rejectStep, runStep } from '#/steps/run-step.js';
import { startTicketStep } from '#/tick/director-jobs.js';
import type { DirectorApply } from '#/types/director-jobs.types.js';
import type { EngineCtx, QueuedReply } from '#/types/engine-state.types.js';

/** Asks the `steer_reply` step what to do with `reply` (in a job); returns the delivery to apply, or nothing. */
async function askSteer(
  ctx: EngineCtx,
  reply: QueuedReply,
): Promise<DirectorApply | undefined> {
  const { deps, state } = ctx;
  const ticket = await deps.storage.transaction((tx) =>
    tx.tickets.get(reply.ticketId as TicketId),
  );

  const pump = ticket?.assignee_run_id
    ? state.pumps.get(ticket.assignee_run_id)
    : undefined;

  if (!ticket || !pump || pump.done) {
    deps.log?.('info', `dropping reply for ${reply.ticketId}: no live run`);

    return undefined;
  }

  const supported = pump.driver.capabilities().steerModes;
  const answer = await runStep(
    ctx,
    'steer_reply',
    {
      ticket: { id: ticket.id, title: ticket.title, status: ticket.status },
      reply: { text: reply.text, author: reply.author },
      supported_modes: supported,
    },
    SteerReplyOutput,
  );

  if (!answer.ok) {
    rejectStep(ctx, 'steer_reply', ticket.id, answer.error);

    return undefined;
  }

  const { mode, text } = answer.value;
  if (mode === 'none' || text.trim() === '') {
    return undefined;
  }

  if (!supported.includes(mode)) {
    deps.log?.('warn', `driver cannot ${mode}; reply for ${ticket.id} not delivered`);

    return undefined;
  }

  const sendMode: SteerMode = mode;

  return (tick) => deliver(tick, reply, ticket.id, pump.runId, sendMode, text);
}

/** Delivers the answer in the tick, unless the ticket's run moved on or ended while the step ran. */
async function deliver(
  ctx: EngineCtx,
  reply: QueuedReply,
  ticketId: string,
  runId: string,
  mode: SteerMode,
  text: string,
): Promise<void> {
  const { deps, state } = ctx;
  const pump = state.pumps.get(runId);
  const ticket = await deps.storage.transaction((tx) =>
    tx.tickets.get(ticketId as TicketId),
  );

  if (!pump || pump.done || ticket?.assignee_run_id !== runId) {
    deps.log?.('info', `dropping reply for ${ticketId}: its run ended meanwhile`);

    return;
  }

  try {
    const msg = await deps.storage.transaction((tx) =>
      tx.runInbox.append({ run_id: runId, mode, author: reply.author, text }),
    );

    await pump.driver.steer(pump.handle, text, mode, msg.seq);
    await deps.storage.transaction((tx) =>
      tx.runInbox.markDelivered(runId, msg.seq, ctx.nowIso),
    );

    ctx.report.steered.push({ ticketId, runId, mode });
  } catch (e) {
    ctx.report.errors.push({
      where: `steer ${ticketId}`,
      message: String(e instanceof Error ? e.message : e),
    });
  }
}

/** The job body for one reply: a failure is reported against the ticket, never thrown. */
async function replyJob(
  job: EngineCtx,
  reply: QueuedReply,
): Promise<DirectorApply | undefined> {
  try {
    return await askSteer(job, reply);
  } catch (e) {
    job.report.errors.push({
      where: `steer ${reply.ticketId}`,
      message: String(e instanceof Error ? e.message : e),
    });

    return undefined;
  }
}

/**
 * Starts a job for each reply queued since the last tick, oldest first, while Director slots are
 * free; the rest stay queued. A failure on one does not drop the rest.
 */
export async function deliverReplies(ctx: EngineCtx): Promise<void> {
  const queued = ctx.state.replies;
  ctx.state.replies = [];
  const waiting: QueuedReply[] = [];
  for (const reply of queued) {
    if (!startTicketStep(ctx, reply.ticketId, (job) => replyJob(job, reply))) {
      waiting.push(reply);
    }
  }

  ctx.state.replies = [...waiting, ...ctx.state.replies];
}
