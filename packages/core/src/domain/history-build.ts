/**
 * buildHistory — one ticket's history, merged from every stored source and ordered by time.
 *
 * Why: "what did this ticket go through, and why?" is spread over card events, questions, runs,
 *   stage runs, wakes and gate results. This pure function merges them into one list of plain
 *   entries (code.md rule 6 spirit: one door, so the page and any export agree). A status change
 *   with no stored reason borrows the best neighbour (the question settled at that moment, the wake
 *   that started the run) and otherwise says only what moved; it never invents a cause.
 *
 * Exports: buildHistory(), orderItems().
 * Depends on: domain/history-copy, domain/history-infer, domain/history-kit, domain/history-sources,
 *   domain/history-stages, types/history. No IO.
 */

import { ESCALATION_ACTION_COPY, stateTitle } from '#/domain/history-copy.js';
import { inferReason } from '#/domain/history-infer.js';
import { RANK, actorOfCard, clip, linksOf, pushItem } from '#/domain/history-kit.js';
import { interactionItems, runItems } from '#/domain/history-sources.js';
import { gateItems, stageItems } from '#/domain/history-stages.js';
import type { HistoryEntry } from '#/schemas/history.js';
import type {
  HistoryCtx,
  HistoryItem,
  TicketHistoryFacts,
} from '#/types/history.types.js';

/** Time order, ties broken by rank and then by the order the items were added. */
export function orderItems(items: readonly HistoryItem[]): HistoryEntry[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        Date.parse(a.item.entry.at) - Date.parse(b.item.entry.at) ||
        a.item.rank - b.item.rank ||
        a.index - b.index,
    )
    .map((x) => x.item.entry);
}

/** The merge title: who signed the work off, from the sign-off stage that passed. */
function mergeTitle(facts: TicketHistoryFacts): string {
  const signed = facts.stageRuns.filter((s) => s.outcome.signed_by !== undefined).at(-1);
  if (signed?.outcome.signed_by === 'owner') {
    return 'Signed off by you and merged';
  }

  if (signed?.outcome.signed_by === 'director') {
    return 'Signed off by the Director and merged';
  }

  return 'Merged and done';
}

function eventItems(ctx: HistoryCtx): void {
  const { facts } = ctx;
  const known = new Set(facts.interactions.map((i) => i.id));
  for (const e of facts.events) {
    const actor = actorOfCard(e.actor);
    const base = { at: e.at, actor, links: linksOf({ card_id: e.card_id }) };
    switch (e.kind) {
      case 'ticket_created':
        if (e.payload.ticket_id === facts.ticketId) {
          pushItem(ctx, RANK.state, {
            ...base,
            kind: 'plan',
            title: `Created: ${clip(e.payload.title)}`,
            ticket_id: facts.ticketId,
          });
        }

        break;
      case 'ticket_state': {
        if (e.payload.ticket_id !== facts.ticketId) {
          break;
        }

        const { from, to } = e.payload;
        const reason = e.payload.reason ?? inferReason(facts, e.at, from, to);
        const done = to === 'done';
        pushItem(ctx, done ? RANK.merge : RANK.state, {
          ...base,
          kind: done ? 'merge' : 'state',
          title: done ? mergeTitle(facts) : stateTitle(from, to, reason),
          ...(done && reason !== undefined ? { detail: reason } : {}),
          from,
          to,
          ticket_id: facts.ticketId,
        });

        break;
      }

      case 'escalation':
        if (e.payload.ticket_id === facts.ticketId) {
          pushItem(ctx, RANK.question, {
            ...base,
            kind: 'question',
            actor: { type: 'engine' },
            title: `Needs you: ${clip(e.payload.title)}`,
            ticket_id: facts.ticketId,
            links: linksOf({
              interaction_id: e.payload.interaction_id,
              card_id: e.card_id,
            }),
          });
        }

        break;
      case 'escalation_settled': {
        if (e.payload.ticket_id !== facts.ticketId) {
          break;
        }

        const by = e.payload.by;
        const who = by === 'owner' ? 'You' : by === 'director' ? 'The Director' : 'Forge';
        const detail = e.payload.comment ?? e.payload.note;
        pushItem(ctx, RANK.answer, {
          ...base,
          kind: 'answer',
          actor: {
            type: by === 'owner' ? 'owner' : by === 'director' ? 'director' : 'engine',
          },
          title: `${who} ${ESCALATION_ACTION_COPY[e.payload.action]}`,
          ...(detail === undefined ? {} : { detail }),
          ticket_id: facts.ticketId,
          links: linksOf({
            interaction_id: e.payload.interaction_id,
            card_id: e.card_id,
          }),
        });

        break;
      }

      case 'interaction_opened':
        if (
          e.payload.ticket_id === facts.ticketId &&
          !known.has(e.payload.interaction_id)
        ) {
          pushItem(ctx, RANK.question, {
            ...base,
            kind: 'question',
            title: `A question opened (${e.payload.interaction_kind})`,
            ticket_id: facts.ticketId,
            links: linksOf({ interaction_id: e.payload.interaction_id }),
          });
        }

        break;
      case 'interaction_answered':
        if (
          e.payload.ticket_id === facts.ticketId &&
          !known.has(e.payload.interaction_id)
        ) {
          pushItem(ctx, RANK.answer, {
            ...base,
            kind: 'answer',
            title: 'The question was answered',
            ticket_id: facts.ticketId,
            links: linksOf({ interaction_id: e.payload.interaction_id }),
          });
        }

        break;
      case 'replan_requested':
        if (e.payload.ticket_id === facts.ticketId) {
          pushItem(ctx, RANK.state, {
            ...base,
            kind: 'plan',
            actor: { type: 'owner' },
            title: 'You sent the card back to the Director to re-plan',
            detail: e.payload.comment,
            ticket_id: facts.ticketId,
          });
        }

        break;
      default:
        break;
    }
  }
}

/** The ticket's history, oldest first. */
export function buildHistory(facts: TicketHistoryFacts): HistoryEntry[] {
  const ctx: HistoryCtx = { facts, out: [] };
  eventItems(ctx);
  interactionItems(ctx);
  runItems(ctx);
  stageItems(ctx);
  gateItems(ctx);

  return orderItems(ctx.out);
}
