/**
 * Plan impact: which of a card's tickets a plan approval would cancel, and which of those the
 * plan does not cover.
 *
 * Why: the Director writes a re-plan from the ticket list it is shown, and approval then cancels
 *   tickets by the engine's own rule. One gathering of the facts (runs, open
 *   interactions, the owner's Re-plan) feeds the planner's input, the approval itself, the floor and the plan page, so
 *   they cannot disagree about what "started" means (CHE-3 and CHE-6 were cancelled although
 *   they had runs and branches). A hold the engine itself placed on a ticket that never ran (a
 *   lane waiting for its pipeline) is not an open question and does not keep a ticket.
 *
 * Exports: keepFactsOf(), cardKeepStates(), planImpact(), replanImpact().
 * Depends on: @forge/core (keep rule, coverage check), tick/plan-keys. Reads storage.
 */

import { isKeptTicket, isReplaceableTicket, uncoveredTickets } from '@forge/core';
import type {
  CancelledTicketFacts,
  CardId,
  Interaction,
  PlanKeepFacts,
  PlanVersion,
  StorageTx,
  Ticket,
} from '@forge/core';
import { planEntryOf, ticketPlanKeys } from '#/tick/plan-keys.js';

/** A pending interaction that is a real open question or approval, not the engine's own lane hold. */
function isOpenItem(i: Interaction): boolean {
  const payload = i.payload as { cause?: unknown } | null;

  return i.status === 'pending' && payload?.cause !== 'lane_hold';
}

const PAGE = 200;

/** Tickets the owner asked to re-plan from (a `replan_requested` event) since the card's last approval. */
async function replanOrigins(tx: StorageTx, cardId: CardId): Promise<Set<string>> {
  const out = new Set<string>();
  let afterSeq: number | undefined;
  for (;;) {
    const page = await tx.cardEvents.list(cardId, {
      limit: PAGE,
      ...(afterSeq === undefined ? {} : { afterSeq }),
    });

    for (const e of page) {
      if (e.kind === 'plan_approved') {
        out.clear();
      } else if (e.kind === 'replan_requested' && e.payload.ticket_id !== undefined) {
        out.add(e.payload.ticket_id);
      }
    }

    const last = page[page.length - 1];
    if (page.length < PAGE || !last) {
      return out;
    }

    afterSeq = last.seq;
  }
}

/** The facts the keep rule reads for one ticket. */
export async function keepFactsOf(
  tx: StorageTx,
  t: Ticket,
  origins: ReadonlySet<string> = new Set(),
): Promise<PlanKeepFacts> {
  const runs = await tx.runs.listByTicket(t.id);
  const items = await tx.interactions.listByTicket(t.id);

  return {
    status: t.status,
    hasRuns: runs.length > 0,
    openItems: items.some(isOpenItem),
    replanOrigin: origins.has(t.id),
  };
}

/** Each of the card's tickets with whether a new plan keeps it or would cancel it (a cancelled ticket is neither). */
export async function cardKeepStates(
  tx: StorageTx,
  cardId: CardId,
): Promise<{ ticket: Ticket; kept: boolean; replaced: boolean }[]> {
  const out: { ticket: Ticket; kept: boolean; replaced: boolean }[] = [];
  const origins = await replanOrigins(tx, cardId);
  for (const ticket of await tx.tickets.listByCard(cardId)) {
    const facts = await keepFactsOf(tx, ticket, origins);

    out.push({ ticket, kept: isKeptTicket(facts), replaced: isReplaceableTicket(facts) });
  }

  return out;
}

/**
 * What the owner's Re-plan from `origin` would do to the card's tickets: the other tickets that would
 * be held and replaced when the new plan is approved, those the plan never cancels, and whether
 * `origin` itself would be replaced. Judged as the approval will see it: the owner's Re-plan marks
 * `origin` and settles its own open item, so it counts as not started work to replace.
 */
export async function replanImpact(
  tx: StorageTx,
  origin: Ticket,
): Promise<{ originReplaced: boolean; held: Ticket[]; kept: Ticket[] }> {
  const out = { originReplaced: false, held: [] as Ticket[], kept: [] as Ticket[] };
  if (origin.card_id === undefined) {
    return out;
  }

  const origins = await replanOrigins(tx, origin.card_id);
  origins.add(origin.id);
  for (const ticket of await tx.tickets.listByCard(origin.card_id)) {
    const facts = await keepFactsOf(tx, ticket, origins);
    const seen = ticket.id === origin.id ? { ...facts, openItems: false } : facts;
    if (ticket.id === origin.id) {
      out.originReplaced = isReplaceableTicket(seen);
    } else if (isReplaceableTicket(seen)) {
      out.held.push(ticket);
    } else if (isKeptTicket(seen)) {
      out.kept.push(ticket);
    }
  }

  return out;
}

/** What approving `plan` would cancel, and which of those tickets the plan does not cover. */
export async function planImpact(
  tx: StorageTx,
  cardId: CardId,
  plan: Pick<PlanVersion, 'tickets' | 'non_goals' | 'assumptions' | 'version'>,
): Promise<{ willCancel: Ticket[]; notCovered: Ticket[]; alreadyExists: Ticket[] }> {
  const states = await cardKeepStates(tx, cardId);
  const willCancel = states.filter((s) => s.replaced).map((s) => s.ticket);
  const keys = await ticketPlanKeys(tx, cardId);
  const planKeys = new Set(plan.tickets.map((t) => t.key));
  // A kept ticket of an EARLIER plan version and a plan ticket with the same key would be the same work twice;
  // tickets this version made (an approved plan read back) never count.
  const alreadyExists = states
    .filter((s) => {
      const made = keys.get(s.ticket.id);

      return (
        s.kept &&
        made !== undefined &&
        made.version < plan.version &&
        planKeys.has(made.key)
      );
    })
    .map((s) => s.ticket);

  const facts: (CancelledTicketFacts & { ticket: Ticket })[] = [];
  for (const ticket of willCancel) {
    const found = await planEntryOf(tx, ticket);

    facts.push({
      ticket,
      id: ticket.id,
      title: ticket.title,
      planKey: found?.entry.key,
      files: found?.entry.files ?? [],
      acceptance: found?.entry.acceptance ?? [],
    });
  }

  const uncovered = new Set(uncoveredTickets(facts, plan).map((c) => c.id));

  return {
    willCancel,
    notCovered: willCancel.filter((t) => uncovered.has(t.id)),
    alreadyExists,
  };
}
