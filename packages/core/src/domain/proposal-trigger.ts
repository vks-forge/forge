/**
 * Proposal trigger — when the same Director change becomes a proposal to change a project's lane.
 *
 * Why: one ticket's pipeline tweak is a judgement call; the same tweak on many tickets from several cards
 *   is a hint that the owner's lane list is out of date. The Director never edits that list (d-0151), it
 *   proposes. The proposal must not be noise, so this rule is plain code: the key counts on at least
 *   `propose_after` tickets from at least `propose_min_cards` cards inside the window, all on the same lane
 *   and the same base list (a changed list starts a new count), and never once a proposal exists for that
 *   base, whatever the owner decided. A ticket with no card never counts toward the card minimum, and a
 *   ticket counts once however many times it was logged. Evidence is the Director's own quoted reasons,
 *   one per card first, so the owner sees varied cases rather than one card repeated.
 *
 * Exports: shouldPropose(), pickEvidence(), MAX_EVIDENCE.
 * Depends on: schemas/pipeline-proposal, types/proposal-trigger. No IO.
 */

import type { ProposalEvidence } from '#/schemas/pipeline-proposal.js';
import type { Lane } from '#/schemas/ticket.js';
import type {
  ProposalDecision,
  ProposalHistoryEntry,
  ProposalSettings,
  SuppressedKey,
} from '#/types/proposal-trigger.types.js';

const DAY_MS = 86_400_000;

/** A proposal quotes at most this many tickets. */
export const MAX_EVIDENCE = 3;

/** The newest entry per ticket, newest first. */
function onePerTicket(entries: readonly ProposalHistoryEntry[]): ProposalHistoryEntry[] {
  const newest = new Map<string, ProposalHistoryEntry>();
  for (const e of entries) {
    const seen = newest.get(e.ticket_id);
    if (!seen || Date.parse(e.at) > Date.parse(seen.at)) {
      newest.set(e.ticket_id, e);
    }
  }

  return [...newest.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/**
 * Whether `key` on `lane` over `base_hash` should become a proposal now. `history` may hold anything;
 * only entries for this key, lane and base inside the window count.
 */
export function shouldPropose(input: {
  readonly key: string;
  readonly lane: Lane;
  readonly base_hash: string;
  readonly history: readonly ProposalHistoryEntry[];
  readonly settings: ProposalSettings;
  readonly suppressed: readonly SuppressedKey[];
  readonly now: number;
}): ProposalDecision {
  const { key, lane, base_hash, settings } = input;
  const none: ProposalDecision = { propose: false, count: 0, cards: 0, matching: [] };
  if (
    input.suppressed.some(
      (s) => s.key === key && s.lane === lane && s.base_hash === base_hash,
    )
  ) {
    return none;
  }

  const from = input.now - settings.propose_window_days * DAY_MS;
  const matching = onePerTicket(
    input.history.filter(
      (h) =>
        h.key === key &&
        h.lane === lane &&
        h.base_hash === base_hash &&
        Date.parse(h.at) >= from &&
        Date.parse(h.at) <= input.now,
    ),
  );

  const cards = new Set(matching.flatMap((h) => h.card_id ?? [])).size;
  const propose =
    matching.length >= settings.propose_after && cards >= settings.propose_min_cards;

  return { propose, count: matching.length, cards, matching };
}

/**
 * Up to three quoted reasons: the newest ticket of each card first (newest first), then the rest by
 * recency, so the evidence is as varied as the history allows.
 */
export function pickEvidence(
  matching: readonly ProposalHistoryEntry[],
): ProposalEvidence[] {
  const sorted = [...matching].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const firstOfCard = new Set<string>();
  const lead: ProposalHistoryEntry[] = [];
  const rest: ProposalHistoryEntry[] = [];
  for (const e of sorted) {
    if (e.card_id !== undefined && !firstOfCard.has(e.card_id)) {
      firstOfCard.add(e.card_id);
      lead.push(e);
    } else {
      rest.push(e);
    }
  }

  return [...lead, ...rest].slice(0, MAX_EVIDENCE).map((e) => ({
    ticket_id: e.ticket_id as ProposalEvidence['ticket_id'],
    ...(e.card_id === undefined
      ? {}
      : { card_id: e.card_id as ProposalEvidence['card_id'] }),
    reason: e.reason,
  }));
}
