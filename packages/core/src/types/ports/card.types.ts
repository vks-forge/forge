/**
 * Card ports — repositories for cards, their history and the card type registry.
 *
 * Why: a card is the record of an intake and the parent of its tickets (d-0105), so the card,
 *   its event log and the type registry commit in the same transaction as the ticket writes
 *   they describe: an intake that creates a card but loses its first `ticket_created` event
 *   would leave a history that disagrees with the tickets. Keeping them behind the storage
 *   port lets the sqlite and in-memory backends honour one contract, and keeps the rolled-up
 *   column out of storage entirely (it is computed in core from tickets and questions).
 *
 *   Card phase, card relations and the reply queue sit behind the same port (d-0134,
 *   d-0141): the phase is written only by compare-and-swap on `phase_version`, a relation set
 *   replaces a card's edges in one step so a half-applied edit cannot leave a cycle the check
 *   never saw, and the reply queue's claim is atomic so two ticks never answer one message.
 *
 * Exports: CardPatch, CardListFilter, CardEventListFilter, CardPhaseUpdate, CardRepository,
 *   CardEventRepository, CardTypeRepository, CardRelationRepository, CardReplyQueueRepository.
 * Depends on: schemas/card, schemas/card-event, schemas/card-reply-queue, schemas/card-type,
 *   schemas/ids. Types only.
 */

import type { Card, CardRelation } from '#/schemas/card.js';
import type { CardEvent, NewCardEvent } from '#/schemas/card-event.js';
import type { CardReplyQueueItem, NewCardReply } from '#/schemas/card-reply-queue.js';
import type { CardType } from '#/schemas/card-type.js';
import type { CardId } from '#/schemas/ids.js';

/** What a card update may change; `closed_reason` and `budget_cap_usd` given as `undefined` are cleared. `updated_at` is the caller's clock. */
export type CardPatch = Partial<
  Pick<Card, 'type' | 'title' | 'summary' | 'priority' | 'links'>
> & {
  readonly closed_reason?: string | undefined;
  readonly budget_cap_usd?: number | undefined;
  readonly updated_at: string;
};

/** One page request: newest `updated_at` first, `id` descending as tie-break; `after` is the previous page's last row (exclusive). */
export interface CardListFilter {
  readonly type?: string;
  readonly after?: { readonly updated_at: string; readonly id: string };
  readonly limit: number;
}

/**
 * History page request over `seq`: strictly after `afterSeq` and strictly before `beforeSeq`
 * (each absent = unbounded). `order` is `asc` (oldest first, the default) or `desc` (newest
 * first, so `limit` takes the newest events in range).
 */
export interface CardEventListFilter {
  readonly afterSeq?: number;
  readonly beforeSeq?: number;
  readonly order?: 'asc' | 'desc';
  readonly limit: number;
}

/** The phase fields `transitionCard()` produced, written with a CAS on the version the caller read. */
export interface CardPhaseUpdate {
  readonly phase: Card['phase'];
  readonly needs_you: boolean;
  readonly updated_at: string;
}

export interface CardRepository {
  get(id: CardId): Promise<Card | null>;
  // The card a source and reference already made in this project (create-card dedupe), or null.
  findBySource(
    project: string,
    kind: Card['source']['kind'],
    ref: string,
  ): Promise<Card | null>;
  // Throws on a duplicate id.
  insert(card: Card): Promise<void>;
  // The next free card number for a project prefix: highest stored `<PREFIX>-C<n>` plus one, 1 when none.
  nextNumber(prefix: string): Promise<number>;
  // One project's cards; see `CardListFilter` for the order.
  listByProject(project: string, filter: CardListFilter): Promise<Card[]>;
  // Applies the patch; false when the card is unknown.
  update(id: CardId, patch: CardPatch): Promise<boolean>;
  // Writes `phase` and `needs_you` and sets `phase_version` to expectedVersion + 1, only if the
  // stored version equals expectedVersion. false = stale writer lost or unknown card.
  updatePhase(
    id: CardId,
    expectedVersion: number,
    update: CardPhaseUpdate,
  ): Promise<boolean>;
}

/** Append-only card history; storage is the only `seq` allocator (0-based, max+1 per card). */
export interface CardEventRepository {
  append(cardId: CardId, event: NewCardEvent): Promise<CardEvent>;
  list(cardId: CardId, filter: CardEventListFilter): Promise<CardEvent[]>;
}

/** The card type registry (d-0106): data rows, listed in display order. */
export interface CardTypeRepository {
  get(name: string): Promise<CardType | null>;
  list(): Promise<CardType[]>;
  // Insert or replace by name; a replaced row keeps its place in `list`.
  upsert(type: CardType): Promise<void>;
}

/** Dependency edges between cards (d-0141 item 2): `from` depends on `to`; "blocks" is the reverse view. */
export interface CardRelationRepository {
  // Every edge of the project's cards, in insertion order (the input of the cycle check).
  listByProject(project: string): Promise<CardRelation[]>;
  // Every edge with the card at either end, in insertion order.
  listFor(cardId: CardId): Promise<CardRelation[]>;
  // Replaces all edges that touch the card with: card depends on each of `dependsOn`, and each of
  // `blocks` depends on the card. Edges between other cards are untouched. Self edges throw InvalidInputError.
  replaceFor(
    cardId: CardId,
    dependsOn: readonly CardId[],
    blocks: readonly CardId[],
    at: string,
  ): Promise<void>;
  // Adds one edge; false when it already exists. Self edges throw InvalidInputError.
  add(relation: CardRelation, at: string): Promise<boolean>;
}

/** The durable queue of owed Director replies (d-0134): new events only, claimed atomically. */
export interface CardReplyQueueRepository {
  enqueue(item: NewCardReply): Promise<CardReplyQueueItem>;
  // Marks every unfinished row that is unclaimed, or claimed before `staleBefore`, as claimed at
  // `at`, and returns them oldest first. Inside one transaction this cannot hand a row to two callers.
  claim(at: string, staleBefore: string): Promise<CardReplyQueueItem[]>;
  // Stamps `done_at`; false when the row is unknown or already done.
  complete(id: number, at: string): Promise<boolean>;
  // Rows not yet done for the card, claimed or not (the "Director is thinking" fact).
  listOpen(cardId: CardId): Promise<CardReplyQueueItem[]>;
}
