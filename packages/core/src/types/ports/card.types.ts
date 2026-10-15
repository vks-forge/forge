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
 * Exports: CardPatch, CardListFilter, CardEventListFilter, CardRepository,
 *   CardEventRepository, CardTypeRepository.
 * Depends on: schemas/card, schemas/card-event, schemas/card-type, schemas/ids. Types only.
 */

import type { Card } from '#/schemas/card.js';
import type { CardEvent, NewCardEvent } from '#/schemas/card-event.js';
import type { CardType } from '#/schemas/card-type.js';
import type { CardId } from '#/schemas/ids.js';

/** What a card update may change; `closed_reason` and `budget_cap_usd` given as `undefined` are cleared. `updated_at` is the caller's clock. */
export type CardPatch = Partial<Pick<Card, 'type' | 'title' | 'summary'>> & {
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

export interface CardRepository {
  get(id: CardId): Promise<Card | null>;
  // Throws on a duplicate id.
  insert(card: Card): Promise<void>;
  // The next free card number for a project prefix: highest stored `<PREFIX>-C<n>` plus one, 1 when none.
  nextNumber(prefix: string): Promise<number>;
  // One project's cards; see `CardListFilter` for the order.
  listByProject(project: string, filter: CardListFilter): Promise<Card[]>;
  // Applies the patch; false when the card is unknown.
  update(id: CardId, patch: CardPatch): Promise<boolean>;
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
