/**
 * The Director's first look: the sweep that gives every new wait its first reading.
 *
 * Why: a ticket that stops for a person usually does so for a reason the Director can read: a
 *   question the plan already settles, a failure one more try with a hint would fix. So every new
 *   interaction starts in the Director's stage, hidden from the owner, and this sweep (once per
 *   tick, never inside the settle transaction, so no model call holds a database transaction)
 *   gives each its first reading and then hands it to the owner, answered or not. Waits only a
 *   person can fix (a setup, a lane hold, a question that timed out) skip the look, and so do all
 *   waits when the owner turned the first look off. A read that throws, or a row the sweep cannot
 *   place, goes to the owner too: fail closed means ask the human. A ticket that is still being
 *   settled (its run has not paused yet) is looked at on a later tick.
 *
 * Exports: sweepEscalations().
 * Depends on: @forge/core (escalation view, ticket rules), tick/escalation-answer-step,
 *   tick/escalation-recover-step, tick/escalation-raise, tick/escalation-settle, tick/planning-state.
 *   Reads and writes storage.
 */

import { TERMINAL_STATUSES, toEscalation } from '@forge/core';
import type { CardId, Interaction, Ticket, TicketId } from '@forge/core';
import { isCardClosed } from '#/tick/card-close.js';
import { lookAtQuestion } from '#/tick/escalation-answer-step.js';
import { lookAtFailure } from '#/tick/escalation-recover-step.js';
import { handToOwner } from '#/tick/escalation-raise.js';
import { cancelLeftovers } from '#/tick/escalation-settle.js';
import { directorFor } from '#/tick/planning-state.js';
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

  if (view.payload.kind === 'question') {
    return lookAtQuestion(ctx, row, ticket, view.payload);
  }

  if (view.payload.kind === 'failure') {
    return lookAtFailure(ctx, row, ticket, view.payload);
  }
}

/** Gives every director-stage wait its first look, one at a time, oldest first. */
export async function sweepEscalations(ctx: EngineCtx): Promise<void> {
  const waiting = (
    await ctx.deps.storage.transaction((tx) => tx.interactions.listPending())
  ).filter((r) => r.escalated_at === undefined);

  for (const row of waiting) {
    if (ctx.state.escalating.has(row.id)) {
      continue;
    }

    ctx.state.escalating.add(row.id);
    try {
      await lookAt(ctx, row);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      ctx.report.errors.push({ where: `escalation ${row.id}`, message });
      ctx.deps.log?.('error', `first look at ${row.id} failed`, { error: message });
      await handOver(ctx, row).catch(() => undefined);
    } finally {
      ctx.state.escalating.delete(row.id);
    }
  }
}
