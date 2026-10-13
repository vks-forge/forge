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
 *
 * Exports: deliverReplies().
 * Depends on: @forge/core (SteerReplyOutput, WorkerDriver port), steps/run-step.
 */

import { SteerReplyOutput } from '@forge/core';
import type { SteerMode, TicketId } from '@forge/core';
import { rejectStep, runStep } from '#/steps/run-step.js';
import type { EngineCtx, QueuedReply } from '#/types/engine-state.types.js';

async function deliverOne(ctx: EngineCtx, reply: QueuedReply): Promise<void> {
  const { deps, state } = ctx;
  const ticket = await deps.storage.transaction((tx) =>
    tx.tickets.get(reply.ticketId as TicketId),
  );

  const pump = ticket?.assignee_run_id
    ? state.pumps.get(ticket.assignee_run_id)
    : undefined;

  if (!ticket || !pump || pump.done) {
    deps.log?.('info', `dropping reply for ${reply.ticketId}: no live run`);

    return;
  }

  const supported = deps.driver.capabilities().steerModes;
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
    return rejectStep(ctx, 'steer_reply', ticket.id, answer.error);
  }

  const { mode, text } = answer.value;
  if (mode === 'none' || text.trim() === '') {
    return;
  }

  if (!supported.includes(mode)) {
    deps.log?.('warn', `driver cannot ${mode}; reply for ${ticket.id} not delivered`);

    return;
  }

  const sendMode: SteerMode = mode;
  const msg = await deps.storage.transaction((tx) =>
    tx.runInbox.append({
      run_id: pump.runId,
      mode: sendMode,
      author: reply.author,
      text,
    }),
  );

  await deps.driver.steer(pump.handle, text, sendMode, msg.seq);
  await deps.storage.transaction((tx) =>
    tx.runInbox.markDelivered(pump.runId, msg.seq, ctx.nowIso),
  );

  ctx.report.steered.push({ ticketId: ticket.id, runId: pump.runId, mode: sendMode });
}

/** Delivers the replies queued since the last tick; a failure on one does not drop the rest. */
export async function deliverReplies(ctx: EngineCtx): Promise<void> {
  const queued = ctx.state.replies;
  ctx.state.replies = [];
  for (const reply of queued) {
    try {
      await deliverOne(ctx, reply);
    } catch (e) {
      ctx.report.errors.push({
        where: `steer ${reply.ticketId}`,
        message: String(e instanceof Error ? e.message : e),
      });
    }
  }
}
