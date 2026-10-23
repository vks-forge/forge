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
 * Exports: loadChatContext(), cardSpend(), HISTORY_LIMIT, OWNER_CONTROLS.
 * Depends on: tick/memory-context, tick/plan-keys, @forge/core (card schemas, allowedChatActions), types/card-chat, types/engine.
 *   Reads storage and project memory.
 */

import { allowedChatActions } from '@forge/core';
import type { CardEvent, CardId, StorageTx, Ticket } from '@forge/core';
import { buildMemoryContext } from '#/tick/memory-context.js';
import { ticketPlanKeys } from '#/tick/plan-keys.js';
import type { ChatContext } from '#/types/card-chat.types.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/**
 * The controls the owner really has, shown to the Director so it never sends the owner to a
 * button that does not exist (W1b). Keep in step with the web app when a control is added or removed.
 */
export const OWNER_CONTROLS: readonly string[] = [
  'Ticket page: edit priority, dependencies (what the ticket waits for) and, before work starts, the description',
  'Ticket page: act on a ticket that waits for the owner (answer a question, approve or sign off, rework, cancel)',
  'Card page: change the card type, close the card, set the budget cap, set card dependencies',
  'Card page: approve the plan, ask for plan changes, edit plan tickets, restart planning',
  'Ticket page: cancel any unfinished ticket (stops its Worker, removes its work branch; the Director can do the same with cancel_ticket only when the owner asked in this chat turn)',
  'No control exists to pause a ticket, to reorder tickets on the board, or to edit a ticket title or lane',
];

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

/** Why each cancelled ticket of the card was cancelled, from its history line ("You cancelled it: ..."). */
async function cancelReasons(
  tx: StorageTx,
  cardId: CardId,
): Promise<Map<string, string>> {
  const reasons = new Map<string, string>();
  let afterSeq: number | undefined;
  for (;;) {
    const page = await tx.cardEvents.list(cardId, {
      ...(afterSeq === undefined ? {} : { afterSeq }),
      limit: PAGE,
    });

    for (const e of page) {
      if (e.kind === 'ticket_state' && e.payload.to === 'cancelled') {
        reasons.set(e.payload.ticket_id, e.payload.reason ?? 'no reason recorded');
      }
    }

    const last = page[page.length - 1];
    if (page.length < PAGE || !last) {
      return reasons;
    }

    afterSeq = last.seq;
  }
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

    const planKeys = await ticketPlanKeys(tx, card.id);
    const cancelled = await cancelReasons(tx, card.id);
    const rows = [];
    for (const ticket of tickets) {
      const run = ticket.assignee_run_id
        ? await tx.runs.get(ticket.assignee_run_id)
        : null;

      rows.push({
        id: ticket.id,
        // The plan key (t4) is only the plan's own label; the id is what every action takes.
        plan_key: planKeys.get(ticket.id)?.key ?? null,
        title: ticket.title,
        priority: ticket.priority,
        depends_on: ticket.blocked_by,
        state: ticket.status,
        lane: ticket.lane,
        run_id: run?.id ?? null,
        run_status: run?.status ?? null,
        // So the Director never re-files what the owner cancelled unasked (d-0179).
        ...(ticket.status === 'cancelled'
          ? { cancel_reason: cancelled.get(ticket.id) ?? 'no reason recorded' }
          : {}),
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
      // The card total the budget warning compares: ticket runs plus the Director's own steps.
      spend:
        (await cardSpend(tx, tickets)) +
        (await tx.cardPlanning.get(card.id)).grill.director_spend_usd,
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
      owner_controls: OWNER_CONTROLS,
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
