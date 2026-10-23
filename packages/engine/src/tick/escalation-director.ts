/**
 * The Director's first look: the sweep that gives every new wait its first reading.
 *
 * Why: a ticket that stops for a person usually does so for a reason the Director can read: a
 *   question the plan already settles, a failure one more try with a hint would fix. So every new
 *   interaction starts in the Director's stage, hidden from the owner, and this sweep (once per
 *   tick, never inside the settle transaction, so no model call holds a database transaction)
 *   gives each its first reading and then hands it to the owner, answered or not. The readings that
 *   need a model call run as jobs beside the tick (one per ticket, within the Director's step limit,
 *   ahead of card turns and triage because a ticket is stopped on them); the tick that collects a
 *   job applies the result, and drops it when the wait was settled or the ticket moved on while the
 *   step ran. Waits only a
 *   person can fix (a setup, a lane hold, a question that timed out) skip the look, and so do all
 *   waits when the owner turned the first look off. A read that throws, or a row the sweep cannot
 *   place, goes to the owner too: fail closed means ask the human. A ticket that is still being
 *   settled (its run has not paused yet) is looked at on a later tick.
 *
 * Exports: sweepEscalations().
 * Depends on: @forge/core (escalation view, ticket rules), tick/director-jobs, tick/escalation-answer-step,
 *   tick/escalation-recover-step, tick/escalation-substitute-step, tick/escalation-raise, tick/escalation-settle, tick/planning-state.
 *   Reads and writes storage.
 */

import { TERMINAL_STATUSES, toEscalation } from '@forge/core';
import type { CardId, Interaction, Ticket, TicketId } from '@forge/core';
import { isCardClosed } from '#/tick/card-close.js';
import { startTicketStep, ticketKey } from '#/tick/director-jobs.js';
import { lookAtQuestion } from '#/tick/escalation-answer-step.js';
import { lookAtFailure } from '#/tick/escalation-recover-step.js';
import { lookAtNoAgent } from '#/tick/escalation-substitute-step.js';
import { handToOwner } from '#/tick/escalation-raise.js';
import { cancelLeftovers } from '#/tick/escalation-settle.js';
import { directorFor } from '#/tick/planning-state.js';
import type { DirectorApply } from '#/types/director-jobs.types.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Hands the row to the owner as it stands (no suggestion, no diagnosis). */
async function handOver(ctx: EngineCtx, row: Interaction): Promise<void> {
  await ctx.deps.storage.transaction((tx) =>
    handToOwner(tx, ctx.nowIso, row, toEscalation(row).payload),
  );
}

async function lookAt(ctx: EngineCtx, row: Interaction): Promise<void> {
  const loaded = await ctx.deps.storage.transaction(async (tx) => {
    const ticket = await tx.tickets.get(row.ticket_id as TicketId);
    const slug = ticket
      ? ((await tx.projects.get(ticket.project))?.slug ?? ticket.project)
      : null;

    return { ticket, slug };
  });

  const ticket: Ticket | null = loaded.ticket;
  if (!ticket || loaded.slug === null) {
    return;
  }

  const card =
    ticket.card_id === undefined
      ? null
      : await ctx.deps.storage.transaction((tx) =>
          tx.cards.get(ticket.card_id as CardId),
        );

  if (TERMINAL_STATUSES.includes(ticket.status) || (card && isCardClosed(card))) {
    await ctx.deps.storage.transaction((tx) =>
      cancelLeftovers(tx, ctx.nowIso, ticket.id, `the ticket is ${ticket.status}`),
    );

    return;
  }

  // The run of a paused ticket settles in this same tick or the next; look once it has.
  if (ticket.status !== 'waiting_human' && ticket.status !== 'blocked') {
    return;
  }

  const view = toEscalation(row);
  const firstLook = directorFor(ctx, loaded.slug).director.escalation.director_first;
  // A decision on a hold and a sign-off are the owner's alone: the Director never settles them.
  const ownerOnly =
    view.payload.kind === 'setup' ||
    view.payload.kind === 'decision' ||
    view.payload.kind === 'sign_off' ||
    (view.payload.kind === 'failure' &&
      (view.payload.cause === 'lane_hold' || view.payload.cause === 'question_timeout'));

  if (ownerOnly || !firstLook) {
    return handOver(ctx, row);
  }

  const payload = view.payload;
  const look =
    payload.kind === 'question'
      ? (job: EngineCtx) => lookAtQuestion(job, row, ticket, payload)
      : payload.kind === 'failure'
        ? // A stage that ran out of places to run is for a substitute, not for one more try with a note.
          payload.cause === 'no_agent_available'
          ? (job: EngineCtx) => lookAtNoAgent(job, row, ticket, payload)
          : (job: EngineCtx) => lookAtFailure(job, row, ticket, payload)
        : null;

  if (look) {
    startTicketStep(ctx, ticket.id, (job) => lookJob(job, row, look));
  }
}

/**
 * The job body of a first look. A read that throws goes to the owner (fail closed): the error is
 * reported and the apply hands the row over as it stands.
 */
async function lookJob(
  job: EngineCtx,
  row: Interaction,
  look: (job: EngineCtx) => Promise<DirectorApply>,
): Promise<DirectorApply> {
  let apply: DirectorApply;
  try {
    apply = await look(job);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    job.report.errors.push({ where: `escalation ${row.id}`, message });
    job.deps.log?.('error', `first look at ${row.id} failed`, { error: message });
    apply = (tick) => handOver(tick, row);
  }

  return async (tick) => {
    if (await stillOwed(tick, row)) {
      await apply(tick);
    }
  };
}

/** True while the wait is still the Director's to look at and its ticket still stops on it. */
async function stillOwed(ctx: EngineCtx, row: Interaction): Promise<boolean> {
  return ctx.deps.storage.transaction(async (tx) => {
    const fresh = await tx.interactions.get(row.id);
    const ticket = await tx.tickets.get(row.ticket_id as TicketId);

    return (
      fresh?.status === 'pending' &&
      fresh.escalated_at === undefined &&
      (ticket?.status === 'waiting_human' || ticket?.status === 'blocked')
    );
  });
}

/**
 * Gives every director-stage wait its first look, oldest first: the quick cases (owner-only waits,
 * a settled ticket) in this tick, the others as jobs while Director slots are free.
 */
export async function sweepEscalations(ctx: EngineCtx): Promise<void> {
  const waiting = (
    await ctx.deps.storage.transaction((tx) => tx.interactions.listPending())
  ).filter((r) => r.escalated_at === undefined);

  for (const row of waiting) {
    if (ctx.state.directorJobs.has(ticketKey(row.ticket_id))) {
      continue;
    }

    try {
      await lookAt(ctx, row);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      ctx.report.errors.push({ where: `escalation ${row.id}`, message });
      ctx.deps.log?.('error', `first look at ${row.id} failed`, { error: message });
      await handOver(ctx, row).catch(() => undefined);
    }
  }
}
