/**
 * Intake: an event from the outside becomes a ticket, a steering reply or an answer.
 *
 * Why: users, webhooks and cron all reach the Director as intake events (director-core.md
 *   §7). Events are stored first and deduped on (source, dedupe_key), so a redelivered
 *   webhook never makes a second ticket. A new request first becomes a card, the record of
 *   the intake (d-0105), in `grilling` with a `user_message` event and a queued Director
 *   reply, so the Director plans before any work exists (d-0128). Only when the card's type
 *   starts tickets at intake (the registry says so, d-0106; today the PR fast path alone) is
 *   an `inbox` ticket linked to the card, all in the same transaction that records the
 *   event, with the next `<PROJECT>-<n>` id, and the card starts `queued` with no Director
 *   turn. An unknown card type, or a source the type does not accept, is ignored (fail
 *   closed) and makes nothing; the model
 *   call (triage) is deliberately NOT here, so intake stays fast and a model outage never
 *   loses a request. A reply either answers the one question a parked ticket is waiting
 *   on, or is queued to steer the ticket's live run on the next tick.
 *
 * Exports: ingest().
 * Depends on: @forge/core (schemas), domain/titles, tick/card-create, tick/card-log,
 *   tick/interactions, tick/ticket-insert, tick/tick-requests. Reads and writes storage.
 */

import { NewRequestPayload, ReplyPayload } from '@forge/core';
import type { CardActor, IntakeEvent, Ticket } from '@forge/core';
import { deriveTitle } from '#/domain/titles.js';
import { iso } from '#/shared/time.js';
import { createCardTx } from '#/tick/card-create.js';
import { ENGINE_ACTOR } from '#/tick/card-log.js';
import { answerPending } from '#/tick/interactions.js';
import { insertInboxTicket } from '#/tick/ticket-insert.js';
import { requestTick } from '#/tick/tick-requests.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps, IngestResult } from '#/types/engine.types.js';

/** Who the card names as its creator: the GitHub login when the text came from GitHub, else the intake actor. */
function cardActor(event: IntakeEvent): CardActor {
  if (event.author?.kind === 'github' && event.author.login) {
    return { type: 'github', id: event.author.login };
  }

  return { type: event.actor.type, id: event.actor.id };
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
      const typeName = p.card_type ?? 'issue';
      const cardType = await tx.cardTypes.get(typeName);
      if (!cardType) {
        return { status: 'ignored', reason: `unknown card type ${typeName}` };
      }

      if (!cardType.allowed_sources.includes(event.source)) {
        return {
          status: 'ignored',
          reason: `card type ${typeName} does not accept ${event.source}`,
        };
      }

      const now = iso(deps.clock.now());
      const title = p.title ?? deriveTitle(p.text);
      const made = await createCardTx(tx, project, {
        type: typeName,
        title,
        summary: p.text,
        message: p.text,
        source: { kind: event.source, ref: event.dedupe_key },
        creator: cardActor(event),
        // The PR fast path files its ticket below and needs no Director turn; every other card is planned first.
        phase: cardType.tickets_on_intake ? 'queued' : 'grilling',
        wake: !cardType.tickets_on_intake,
        at: now,
      });

      if (!('card' in made)) {
        return { status: 'ignored', reason: `card refused: ${made.status}` };
      }

      const cardId = made.card.id;
      if (!cardType.tickets_on_intake) {
        return { status: 'card_created', cardId };
      }

      const ticket = await insertInboxTicket(tx, project, {
        cardId,
        title,
        body: p.text,
        type: p.type ?? 'chore',
        createdByIntake: stored.id,
        at: now,
        actor: ENGINE_ACTOR,
      });

      await tx.intakeEvents.markTicket(stored.id, ticket.id);

      return { status: 'ticket_created', ticketId: ticket.id, cardId };
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
    result.status === 'card_created' ||
    result.status === 'reply_queued' ||
    result.status === 'answered'
  ) {
    requestTick(deps, state);
  }

  return result;
}
