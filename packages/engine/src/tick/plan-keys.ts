/**
 * Plan keys: which plan entry each ticket of a card came from.
 *
 * Why: a card's tickets are made when a plan version is approved, and later steps need to go
 *   back from a ticket to its plan entry: the Director answering a Worker's question reads the
 *   ticket's planned files and acceptance, and a re-plan shows the planner which keys already
 *   exist (so done work is not planned twice). The approval event records the plan keys next to
 *   the ticket ids; events written before that carry only the ids, in the plan's own order, so
 *   the key is read off the stored plan version by position.
 *
 * Exports: ticketPlanKeys(), planEntryOf().
 * Depends on: @forge/core (card event, plan types, storage tx). Reads storage.
 */

import type { CardId, PlanTicket, StorageTx, Ticket } from '@forge/core';

const PAGE = 200;

/** The plan key and version of every ticket that an approved plan made for the card. */
export async function ticketPlanKeys(
  tx: StorageTx,
  cardId: CardId,
): Promise<Map<string, { key: string; version: number }>> {
  const out = new Map<string, { key: string; version: number }>();
  let afterSeq: number | undefined;
  for (;;) {
    const page = await tx.cardEvents.list(cardId, {
      limit: PAGE,
      ...(afterSeq === undefined ? {} : { afterSeq }),
    });

    for (const e of page) {
      if (e.kind !== 'plan_approved') {
        continue;
      }

      const { version, ticket_ids: ids, plan_keys: keys } = e.payload;
      const plan = keys ? null : await tx.cardPlanning.getPlan(cardId, version);
      ids.forEach((id, i) => {
        const key = keys?.[i] ?? plan?.tickets[i]?.key;
        if (key !== undefined) {
          out.set(id, { key, version });
        }
      });
    }

    const last = page[page.length - 1];
    if (page.length < PAGE || !last) {
      return out;
    }

    afterSeq = last.seq;
  }
}

/** The plan entry a ticket was made from, or null for a ticket with no card or no approved plan. */
export async function planEntryOf(
  tx: StorageTx,
  ticket: Pick<Ticket, 'id' | 'card_id'>,
): Promise<{ version: number; entry: PlanTicket } | null> {
  if (ticket.card_id === undefined) {
    return null;
  }

  const found = (await ticketPlanKeys(tx, ticket.card_id)).get(ticket.id);
  if (!found) {
    return null;
  }

  const plan = await tx.cardPlanning.getPlan(ticket.card_id, found.version);
  const entry = plan?.tickets.find((t) => t.key === found.key);

  return entry ? { version: found.version, entry } : null;
}
