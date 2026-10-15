/**
 * InboxStateRepository port — the person's read and archive marks on inbox items.
 *
 * Why: inbox items are derived from tickets, interactions and gates, so the only thing worth
 *   persisting is what the person did with them. Keeping that behind the storage port means
 *   the marks commit in the same transaction as any other write and survive a restart, while
 *   the resurface rule (a mark expires when the source changes) stays in core, not in SQL.
 *
 * Exports: InboxStateRepository.
 * Depends on: schemas/inbox. Types only.
 */

import type { InboxKind, InboxStateRow } from '#/schemas/inbox.js';

export interface InboxStateRepository {
  get(project: string, kind: InboxKind, itemId: string): Promise<InboxStateRow | null>;
  // Every mark of one project, in no particular order. Rows never leak across projects.
  listByProject(project: string): Promise<InboxStateRow[]>;
  // Insert or replace the row for (project, kind, item_id).
  upsert(row: InboxStateRow): Promise<void>;
}
