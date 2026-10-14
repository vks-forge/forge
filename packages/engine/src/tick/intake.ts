/**
 * Intake: an event from the outside becomes a ticket, a steering reply or an answer.
 *
 * Why: users, webhooks and cron all reach the Director as intake events (director-core.md
 *   §7). Events are stored first and deduped on (source, dedupe_key), so a redelivered
 *   webhook never makes a second ticket. A new request becomes an `inbox` ticket in the
 *   same transaction that records the event, with the next `<PROJECT>-<n>` id; the model
 *   call (triage) is deliberately NOT here, so intake stays fast and a model outage never
 *   loses a request. A reply either answers the one question a parked ticket is waiting
 *   on, or is queued to steer the ticket's live run on the next tick.
 *
 * Exports: ingest().
 * Depends on: @forge/core (schemas, makeTicketId), domain/ticket-numbers, domain/titles,
 *   tick/interactions, tick/tick-requests. Reads and writes storage.
 */

import { NewRequestPayload, ReplyPayload, TicketStatus, makeTicketId } from '@forge/core';
import type { IntakeEvent, StorageTx, Ticket } from '@forge/core';
import { nextTicketNumber } from '#/domain/ticket-numbers.js';
import { deriveTitle } from '#/domain/titles.js';
import { iso } from '#/shared/time.js';
import { answerPending } from '#/tick/interactions.js';
import { requestTick } from '#/tick/tick-requests.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps, IngestResult } from '#/types/engine.types.js';

async function allTicketIds(tx: StorageTx): Promise<string[]> {
  const lists = await Promise.all(
    TicketStatus.options.map((s) => tx.tickets.listByStatus(s)),
  );

  return lists.flat().map((t) => t.id);
}

/** Stores the event (deduped) and maps it; unknown projects and malformed payloads are ignored. */
export async function ingest(
  deps: EngineDeps,
  state: EngineState,
  event: IntakeEvent,
): Promise<IngestResult> {
  const result = await deps.storage.transaction(async (tx): Promise<IngestResult> => {
    const project = await tx.projects.get(event.project);
    if (!project) {
      return { status: 'ignored', reason: `unknown project ${event.project}` };
    }

    if (project.status === 'archived') {
      return { status: 'ignored', reason: `project ${event.project} is archived` };
    }

    const { inserted, event: stored } = await tx.intakeEvents.insertIfNew(event);
    if (!inserted) {
      return { status: 'duplicate' };
    }

    if (event.kind === 'new_request') {
      const payload = NewRequestPayload.safeParse(event.payload);
      if (!payload.success) {
        return { status: 'ignored', reason: 'malformed new_request payload' };
      }

      const p = payload.data;
      const id = makeTicketId(
        project.prefix,
        nextTicketNumber(await allTicketIds(tx), project.prefix),
      );

      const now = iso(deps.clock.now());
      const ticket: Ticket = {
        id,
        project: project.id,
        title: p.title ?? deriveTitle(p.text),
        body: p.text,
        type: p.type ?? 'chore',
        lane: 'express',
        tier_predicted: 'A',
        status: 'inbox',
        status_version: 0,
        rework_count: 0,
        created_by_intake: stored.id,
        created_at: now,
        updated_at: now,
        blocked_by: [],
      };

      await tx.tickets.insert(ticket);
      await tx.intakeEvents.markTicket(stored.id, id);

      return { status: 'ticket_created', ticketId: id };
    }

    if (event.kind === 'reply') {
      const payload = ReplyPayload.safeParse(event.payload);
      if (!payload.success) {
        return { status: 'ignored', reason: 'malformed reply payload' };
      }

      const ticket = await tx.tickets.get(payload.data.ticket_id as Ticket['id']);
      if (!ticket) {
        return { status: 'ignored', reason: `unknown ticket ${payload.data.ticket_id}` };
      }

      const answered = await answerPending(deps, tx, ticket, payload.data.text);
      if (answered) {
        return { status: 'answered', interactionId: answered };
      }

      const live = ticket.assignee_run_id
        ? state.pumps.get(ticket.assignee_run_id)
        : undefined;

      if (live && !live.done) {
        state.replies.push({
          ticketId: ticket.id,
          text: payload.data.text,
          author: event.actor.id,
        });

        return { status: 'reply_queued', ticketId: ticket.id };
      }

      return {
        status: 'ignored',
        reason: `${ticket.id} has no live run or pending question`,
      };
    }

    return { status: 'ignored', reason: `commands are not handled yet (${event.kind})` };
  });

  if (
    result.status === 'ticket_created' ||
    result.status === 'reply_queued' ||
    result.status === 'answered'
  ) {
    requestTick(deps, state);
  }

  return result;
}
