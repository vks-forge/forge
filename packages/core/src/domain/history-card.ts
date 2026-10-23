/**
 * buildCardHistory and pageHistory — a card's history and the time paging both histories share.
 *
 * Why: a card is the whole intake: the owner's messages, the Director's grilling and plan, and
 *   then its tickets. The card's History tab shows the card's own phases in full and each ticket
 *   event as a single roll-up line naming the ticket, so the card reads as a story while the
 *   ticket's own tab holds the detail. Paging by time keeps long histories cheap to load and gives
 *   clients a stable cursor.
 *
 * Exports: buildCardHistory(), pageHistory().
 * Depends on: domain/history-build, domain/history-copy, domain/history-kit, schemas/history,
 *   types/history. No IO.
 */

import { orderItems } from '#/domain/history-build.js';
import { ESCALATION_ACTION_COPY, stateTitle } from '#/domain/history-copy.js';
import { RANK, actorOfCard, clip, linksOf } from '#/domain/history-kit.js';
import { HISTORY_PAGE_DEFAULT, HISTORY_PAGE_MAX } from '#/schemas/history.js';
import type { HistoryEntry, HistoryPage } from '#/schemas/history.js';
import type { CardEvent } from '#/schemas/card-event.js';
import type { CardHistoryFacts, HistoryItem } from '#/types/history.types.js';

function cardEntry(e: CardEvent): HistoryItem | undefined {
  const actor = actorOfCard(e.actor);
  const links = linksOf({ card_id: e.card_id });
  const base = { at: e.at, actor, links };
  const item = (
    rank: number,
    entry: Omit<HistoryEntry, 'at' | 'actor' | 'links'> & {
      links?: HistoryEntry['links'];
    },
  ): HistoryItem => ({
    rank,
    entry: { ...base, ...entry },
  });

  switch (e.kind) {
    case 'user_message':
      return item(RANK.answer, {
        kind: 'note',
        title: 'You wrote',
        detail: e.payload.text,
      });
    case 'director_message':
      return item(RANK.answer, {
        kind: 'director',
        title: 'The Director replied',
        detail: e.payload.text,
      });
    case 'director_action':
      return item(RANK.check, {
        kind: 'director',
        title: `The Director ${e.payload.result === 'done' ? 'did' : 'could not do'}: ${clip(e.payload.summary)}`,
      });
    case 'close_suggested':
      return item(RANK.check, {
        kind: 'director',
        title: `The Director suggested closing: ${clip(e.payload.reason)}`,
      });
    case 'type_changed':
      return item(RANK.check, {
        kind: 'setup',
        title: `Card type changed from ${e.payload.from} to ${e.payload.to}`,
      });
    case 'card_closed':
      return item(RANK.merge, {
        kind: 'state',
        title: `Card closed: ${clip(e.payload.reason)}`,
      });
    case 'budget_warning':
      return item(RANK.check, {
        kind: 'note',
        title: `Spend passed ${Math.round(e.payload.threshold * 100)}% of the card's cap`,
      });
    case 'note':
      return item(RANK.check, { kind: 'note', title: clip(e.payload.text) });
    case 'step_finished':
      return item(RANK.end, {
        kind: 'director',
        title:
          e.payload.outcome === 'paused_for_you'
            ? `The Director paused for you: ${e.payload.label}`
            : e.payload.outcome === 'failed'
              ? `The Director could not finish: ${e.payload.label}`
              : `The Director finished: ${e.payload.label}`,
        ...(e.payload.summary === '' ? {} : { detail: e.payload.summary }),
      });
    case 'grill_question':
      return item(RANK.question, {
        kind: 'question',
        title: `The Director asked: ${clip(e.payload.text)}`,
      });
    case 'grill_answer':
      return item(RANK.answer, {
        kind: 'answer',
        title:
          e.payload.by === 'owner'
            ? 'You answered'
            : 'The Director took its own recommendation',
        ...(e.payload.text === undefined ? {} : { detail: e.payload.text }),
      });
    case 'grill_done':
      return item(RANK.check, {
        kind: 'plan',
        title: 'The Director finished asking questions',
      });
    case 'plan_ready':
      return item(RANK.check, {
        kind: 'plan',
        title: `Plan v${e.payload.version} is ready (${e.payload.ticket_count} tickets)`,
      });
    case 'plan_approved':
      return item(RANK.check, {
        kind: 'plan',
        title: `Plan v${e.payload.version} approved by ${e.payload.by === 'owner' ? 'you' : 'the Director'}`,
      });
    case 'plan_changes_requested':
      return item(RANK.check, {
        kind: 'plan',
        title: `You asked for changes to plan v${e.payload.version}`,
        detail: e.payload.comment,
      });
    case 'needs_you':
      return item(RANK.question, {
        kind: 'question',
        title: `Needs you: ${clip(e.payload.title ?? e.payload.reason)}`,
        ...(e.payload.ticket_id === undefined ? {} : { ticket_id: e.payload.ticket_id }),
      });
    case 'replan_requested':
      return item(RANK.state, {
        kind: 'plan',
        title: 'You sent the card back to the Director to re-plan',
        detail: e.payload.comment,
        ...(e.payload.ticket_id === undefined ? {} : { ticket_id: e.payload.ticket_id }),
      });
    case 'ticket_created':
      return item(RANK.state, {
        kind: 'plan',
        title: `${e.payload.ticket_id} created: ${clip(e.payload.title)}`,
        ticket_id: e.payload.ticket_id,
      });
    case 'ticket_state':
      return item(RANK.state, {
        kind: e.payload.to === 'done' ? 'merge' : 'state',
        title: `${e.payload.ticket_id}: ${stateTitle(e.payload.from, e.payload.to, e.payload.reason)}`,
        from: e.payload.from,
        to: e.payload.to,
        ticket_id: e.payload.ticket_id,
      });
    case 'escalation':
      return item(RANK.question, {
        kind: 'question',
        title: `${e.payload.ticket_id} needs you: ${clip(e.payload.title)}`,
        ticket_id: e.payload.ticket_id,
        links: linksOf({ card_id: e.card_id, interaction_id: e.payload.interaction_id }),
      });
    case 'escalation_settled':
      return item(RANK.answer, {
        kind: 'answer',
        title: `${e.payload.ticket_id}: ${e.payload.by === 'owner' ? 'you' : e.payload.by === 'director' ? 'the Director' : 'Forge'} ${ESCALATION_ACTION_COPY[e.payload.action]}`,
        ticket_id: e.payload.ticket_id,
        links: linksOf({ card_id: e.card_id, interaction_id: e.payload.interaction_id }),
      });
    default:
      return undefined;
  }
}

/** A card's history, oldest first: its own phases and one roll-up line per ticket event. */
export function buildCardHistory(facts: CardHistoryFacts): HistoryEntry[] {
  const items: HistoryItem[] = [];
  for (const e of facts.events) {
    const made = cardEntry(e);
    if (made !== undefined) {
      items.push(made);
    }
  }

  return orderItems(items);
}

/**
 * The newest `limit` entries strictly before `before` (all when absent), oldest first. A page never
 * ends between two entries of the same instant, so the next page's cursor loses nothing.
 */
export function pageHistory(
  entries: readonly HistoryEntry[],
  opts: { before?: string; limit?: number } = {},
): HistoryPage {
  const limit = Math.min(
    Math.max(1, opts.limit ?? HISTORY_PAGE_DEFAULT),
    HISTORY_PAGE_MAX,
  );

  const cut = opts.before === undefined ? Infinity : Date.parse(opts.before);
  const pool = entries.filter((e) => Date.parse(e.at) < cut);
  let start = Math.max(0, pool.length - limit);
  while (start > 0 && pool[start - 1]?.at === pool[start]?.at) {
    start -= 1;
  }

  const page = pool.slice(start);
  const first = page[0];

  return {
    entries: page,
    has_more: start > 0,
    ...(start > 0 && first !== undefined ? { next_before: first.at } : {}),
  };
}
