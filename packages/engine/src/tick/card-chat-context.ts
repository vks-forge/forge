/**
 * Card chat context: everything the Director is shown before it answers.
 *
 * Why: the Director can only advise well on a card it can see whole: what was said, which
 *   tickets exist and how far they got, which questions wait on the user, how much has been
 *   spent against the cap, what the project remembers, and which actions this card type
 *   allows. The view is bounded (recent history only, each entry clipped) so a long card
 *   cannot blow the prompt, and every user or issue text rides inside the JSON input, which
 *   the driver fences as data, never as instructions. A closed card gets no context: it takes
 *   no chat.
 *
 * Exports: loadChatContext(), cardSpend(), HISTORY_LIMIT.
 * Depends on: tick/memory-context, @forge/core (card schemas, allowedChatActions), types/card-chat, types/engine.
 *   Reads storage and project memory.
 */

import { allowedChatActions } from '@forge/core';
import type { CardEvent, CardId, StorageTx, Ticket } from '@forge/core';
import { buildMemoryContext } from '#/tick/memory-context.js';
import type { ChatContext } from '#/types/card-chat.types.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** History entries the Director sees, newest last. */
export const HISTORY_LIMIT = 30;

const TEXT_CLIP = 2000;
const PAGE = 200;

/** Last `n` events of the card, oldest first. Storage has no tail read, so this pages through. */
async function recentEvents(
  tx: StorageTx,
  cardId: CardId,
  n: number,
): Promise<CardEvent[]> {
  let tail: CardEvent[] = [];
  let afterSeq: number | undefined;
  for (;;) {
    const page = await tx.cardEvents.list(cardId, {
      ...(afterSeq === undefined ? {} : { afterSeq }),
      limit: PAGE,
    });

    tail = [...tail, ...page].slice(-n);
    const last = page[page.length - 1];
    if (page.length < PAGE || !last) {
      return tail;
    }

    afterSeq = last.seq;
  }
}

function eventText(event: CardEvent): string {
  const payload: Record<string, unknown> = event.payload;
  const text = typeof payload['text'] === 'string' ? payload['text'] : null;

  return (text ?? JSON.stringify(payload)).slice(0, TEXT_CLIP);
}

/** Dollars spent by the runs of `tickets`; runs without a reported cost count as zero. */
export async function cardSpend(
  tx: StorageTx,
  tickets: readonly Ticket[],
): Promise<number> {
  let total = 0;
  for (const ticket of tickets) {
    for (const run of await tx.runs.listByTicket(ticket.id)) {
      total += run.cost_usd ?? 0;
    }
  }

  return total;
}

/**
 * The card's view for one chat step, or null when the card is gone or closed. Throws when
 * the card names a type or project that does not exist (the step must not guess).
 */
export async function loadChatContext(
  ctx: EngineCtx,
  cardId: CardId,
): Promise<ChatContext | null> {
  const { deps } = ctx;
  const loaded = await deps.storage.transaction(async (tx) => {
    const card = await tx.cards.get(cardId);
    if (!card || card.closed_reason !== undefined) {
      return null;
    }

    const type = await tx.cardTypes.get(card.type);
    if (!type) {
      throw new Error(`card ${card.id} has unknown type ${card.type}`);
    }

    const project = await tx.projects.get(card.project);
    if (!project) {
      throw new Error(`card ${card.id} names unknown project ${card.project}`);
    }

    const tickets = await tx.tickets.listByCard(card.id);
    const ids = new Set<string>(tickets.map((t) => t.id));
    const pending = (await tx.interactions.listPending()).filter((i) =>
      ids.has(i.ticket_id),
    );

    const rows = [];
    for (const ticket of tickets) {
      const run = ticket.assignee_run_id
        ? await tx.runs.get(ticket.assignee_run_id)
        : null;

      rows.push({
        id: ticket.id,
        title: ticket.title,
        state: ticket.status,
        lane: ticket.lane,
        run_id: run?.id ?? null,
        run_status: run?.status ?? null,
      });
    }

    return {
      card,
      type,
      project,
      tickets,
      rows,
      pending,
      history: await recentEvents(tx, card.id, HISTORY_LIMIT),
      spend: await cardSpend(tx, tickets),
    };
  });

  if (!loaded) {
    return null;
  }

  const { card, type, project, tickets } = loaded;
  const memory = await buildMemoryContext(ctx, project.slug, {
    question: [
      card.title,
      card.summary,
      ...loaded.history.slice(-3).map((e) => eventText(e)),
    ].join('\n'),
    rewrite: true,
    cardId: card.id,
  });

  return {
    card,
    type,
    project,
    tickets,
    input: {
      card: {
        id: card.id,
        title: card.title,
        summary: card.summary,
        type: card.type,
        source: card.source,
        budget_cap_usd: card.budget_cap_usd ?? null,
        spent_usd: loaded.spend,
        phase: card.phase,
        priority: card.priority,
        links: card.links,
      },
      card_type: {
        name: type.name,
        label: type.label,
        plan_approval: type.plan_approval,
        tickets_on_intake: type.tickets_on_intake,
      },
      allowed_actions: allowedChatActions(type, card.phase),
      history: loaded.history.map((e) => ({
        seq: e.seq,
        at: e.at,
        actor: `${e.actor.type}:${e.actor.id}`,
        kind: e.kind,
        text: eventText(e),
      })),
      tickets: loaded.rows,
      pending_interactions: loaded.pending.map((i) => ({
        id: i.id,
        ticket_id: i.ticket_id,
        kind: i.kind,
        payload: JSON.stringify(i.payload).slice(0, TEXT_CLIP),
      })),
      memory,
    },
  };
}
