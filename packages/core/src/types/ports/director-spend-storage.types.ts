/**
 * Director spend storage port: the dated ledger of what Director steps cost.
 *
 * Why: Cost, Overview and the ticket page must add Director spend to Worker spend by day and by
 *   project, which an undated total inside a card cannot do. The ledger is append-only (a row is
 *   never edited, so a total never drifts) and is written in the same transaction as the card
 *   event and cached card total it explains. Reads are the three questions the pages ask: a
 *   project's rows in a time window, a card's total, and totals for a set of tickets.
 *
 * Exports: DirectorSpendRepository.
 * Depends on: schemas/director-spend, schemas/ids. Types only.
 */

import type { DirectorSpend, NewDirectorSpend } from '#/schemas/director-spend.js';
import type { CardId } from '#/schemas/ids.js';

export interface DirectorSpendRepository {
  // Appends one row and returns it with its id.
  append(row: NewDirectorSpend): Promise<DirectorSpend>;
  // A project's rows with `from <= at <= to` (either bound optional), oldest first then by id.
  listByProject(
    project: string,
    window?: { readonly from?: string; readonly to?: string },
  ): Promise<DirectorSpend[]>;
  // The card's total dollars across every row that names it (0 when none).
  totalByCard(cardId: CardId): Promise<number>;
  // Summed dollars per ticket id for the ids asked; tickets with no row are absent.
  totalByTicket(ticketIds: readonly string[]): Promise<Record<string, number>>;
}
