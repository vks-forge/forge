/**
 * Needs-you items — what waits on the owner, worked out from the card's history, its
 * escalations and the ticket's own state.
 *
 * Why: the Card and Ticket pages show everything that waits on the owner in one dock, one
 *   item at a time. If each screen scanned whatever history it happened to load it would show
 *   a settled raise or miss a live one, and an event written before the structured fields
 *   existed would have no title. These pure functions decide the list once, on the server:
 *   which raise is still open (a settler after it closes it), what an old event looks like as
 *   an item, how an escalation or a finished ticket becomes an item, and that a closed card
 *   waits on nobody.
 *
 * Exports: NEEDS_YOU_SETTLERS, scanNeedsYou(), raiseItem(), escalationItem(),
 *   cardNeedsYouItems(), ticketNeedsYouItems().
 * Depends on: schemas/card-event, schemas/escalation, schemas/needs-you, types/needs-you. No IO.
 */

import { NEEDS_YOU_TITLE_MAX } from '#/schemas/card-event.js';
import type { CardEvent, NeedsYouKind } from '#/schemas/card-event.js';
import type { EscalationView } from '#/schemas/escalation.js';
import type { NeedsYouItem } from '#/schemas/needs-you.js';
import type {
  CardNeedsYouInput,
  RaiseScan,
  RaisedEvent,
  TicketNeedsYouInput,
} from '#/types/needs-you.types.js';

/** Events that end a raise: the owner or the Director moved the card on. */
export const NEEDS_YOU_SETTLERS: ReadonlySet<string> = new Set([
  'grill_answer',
  'grill_done',
  'plan_approved',
  'plan_changes_requested',
  'step_started',
  'card_closed',
]);

const DEFAULT_TITLE: Readonly<Record<NeedsYouKind, string>> = {
  plan_approval: 'Approve the plan',
  director_questions: 'The Director has a question',
  step_budget: 'The Director ran out of step budget',
  start_planning: 'Start planning this card',
  held_ticket: 'A ticket is held',
  ticket_escalation: 'A ticket needs you',
  ticket_review: 'Ready for your review',
  ticket_signoff: 'Needs your sign-off',
  tool_approval: 'Tool approval',
};

function clip(text: string): string {
  return text.length <= NEEDS_YOU_TITLE_MAX
    ? text
    : `${text.slice(0, NEEDS_YOU_TITLE_MAX - 1).trimEnd()}…`;
}

/** The kind of a raise written before `kind` existed, read from the actions it offered. */
function legacyKind(actions: readonly string[]): NeedsYouKind {
  if (actions.includes('approve_plan')) {
    return 'plan_approval';
  }

  if (actions.includes('raise_step_budget')) {
    return 'step_budget';
  }

  if (actions.includes('start_planning')) {
    return 'start_planning';
  }

  if (actions.includes('run_as_express')) {
    return 'held_ticket';
  }

  return 'director_questions';
}

/**
 * Reads history newest first. The newest `needs_you` wins unless a settler came after it;
 * when the events given hold neither, the answer is `unknown` and the caller reads older ones.
 */
export function scanNeedsYou(newestFirst: readonly CardEvent[]): RaiseScan {
  for (const event of newestFirst) {
    if (event.kind === 'needs_you') {
      return { state: 'raised', event };
    }

    if (NEEDS_YOU_SETTLERS.has(event.kind)) {
      return { state: 'settled' };
    }
  }

  return { state: 'unknown' };
}

/** A card raise as an item; an old event without the structured fields gets them derived. */
export function raiseItem(event: RaisedEvent): NeedsYouItem {
  const { payload } = event;
  const kind = payload.kind ?? legacyKind(payload.actions);
  const items =
    payload.items !== undefined && payload.items.length > 0
      ? [...payload.items]
      : [payload.reason];

  return {
    kind,
    title: clip(payload.title ?? DEFAULT_TITLE[kind]),
    items,
    actions: [...payload.actions],
    raised_at: event.at,
    seq: event.seq,
    ...(payload.ticket_id === undefined ? {} : { ticket_id: payload.ticket_id }),
  };
}

function escalationFacts(view: EscalationView): {
  kind: NeedsYouKind;
  title: string;
  items: string[];
} {
  const { payload, ticket_id: id } = view;
  switch (payload.kind) {
    case 'question':
      return {
        kind: 'ticket_escalation',
        title: `${id} asks a question`,
        items: [payload.text],
      };
    case 'failure':
      return {
        kind: payload.cause === 'lane_hold' ? 'held_ticket' : 'ticket_escalation',
        title:
          payload.cause === 'lane_hold'
            ? `${id} is held: no pipeline yet`
            : `${id} stopped`,
        items: payload.diagnosis
          ? [payload.summary, payload.diagnosis]
          : [payload.summary],
      };
    case 'setup':
      return {
        kind: 'ticket_escalation',
        title: `${id} needs a setup fix`,
        items: [payload.summary],
      };
    case 'decision':
      return {
        kind: 'held_ticket',
        title: `${id} is held for your decision`,
        items: [payload.summary],
      };
    case 'sign_off':
      return {
        kind: 'ticket_signoff',
        title: `${id} needs your sign-off`,
        items: [payload.summary],
      };
    case 'permission':
      return {
        kind: 'tool_approval',
        title: `Allow \`${payload.what}\`?`,
        items: payload.why ? [payload.why, payload.summary] : [payload.summary],
      };
  }
}

/** An escalation as an item, or null while the Director still holds it, once settled, or with nothing to do. */
export function escalationItem(view: EscalationView): NeedsYouItem | null {
  if (view.stage !== 'owner' || view.status !== 'pending' || view.actions.length === 0) {
    return null;
  }

  const facts = escalationFacts(view);

  return {
    kind: facts.kind,
    title: clip(facts.title),
    items: facts.items,
    actions: [...view.actions],
    raised_at: view.escalated_at ?? view.asked_at,
    seq: null,
    ticket_id: view.ticket_id,
    interaction_id: view.id,
  };
}

function escalationItems(views: readonly EscalationView[]): NeedsYouItem[] {
  return views
    .map(escalationItem)
    .filter((item): item is NeedsYouItem => item !== null)
    .sort((a, b) => a.raised_at.localeCompare(b.raised_at));
}

/**
 * The card's items: its own raise first (only while the card flags itself and the history has
 * not settled it), then the escalations waiting on the owner, oldest first. A closed card
 * waits on nobody.
 */
export function cardNeedsYouItems(input: CardNeedsYouInput): NeedsYouItem[] {
  if (input.card.closed_reason !== undefined) {
    return [];
  }

  const own =
    input.card.needs_you && input.scan.state === 'raised'
      ? [raiseItem(input.scan.event)]
      : [];

  return [...own, ...escalationItems(input.escalations)];
}

/**
 * The ticket's items: its escalations waiting on the owner, plus finished work waiting for a
 * review or a sign-off that has no escalation of its own. A scheduler wait that only offers
 * Cancel is not something the owner is asked to do, so it is not an item.
 */
export function ticketNeedsYouItems(input: TicketNeedsYouInput): NeedsYouItem[] {
  const items = escalationItems(input.escalations);
  const { ticket } = input;
  const finished = ticket.status === 'review' || ticket.status === 'needs_signoff';
  const covered = items.some((i) => i.kind === 'ticket_signoff');

  if (finished && !covered && input.waitActions.length > 0) {
    const signoff = ticket.status === 'needs_signoff';
    items.push({
      kind: signoff ? 'ticket_signoff' : 'ticket_review',
      title: clip(
        signoff ? `${ticket.id} needs your sign-off` : `${ticket.id} is ready for review`,
      ),
      items: [],
      actions: [...input.waitActions],
      raised_at: ticket.updated_at,
      seq: null,
      ticket_id: ticket.id,
    });
  }

  return items;
}
