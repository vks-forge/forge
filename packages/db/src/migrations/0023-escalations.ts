/**
 * Migration 0023: ticket escalations — the owner-stage stamp on interactions and the card index.
 *
 * Why: every wait on the owner is now one interaction (a question, a failure or a setup), and it
 *   starts with the Director, who looks first; the owner sees it only once `escalated_at` is set.
 *   Questions asked before this release were already the owner's, so each existing row is
 *   stamped `escalated_at = asked_at`; without that the Inbox, which lists only stamped rows,
 *   would drop a question its ticket still waits on. Each row also gets the card of its ticket
 *   (`card_id` was set only for card-level questions), so the Card page can list every wait of
 *   its tickets with one indexed read. Nothing here classifies the old parked tickets: that is
 *   done by the engine's start-up sweep from the reason text, in code, so both storage
 *   adapters give the same answer.
 *
 * Exports: MIGRATION_0023.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0023: Migration = {
  id: 23,
  name: 'escalations',
  sql: `
ALTER TABLE interactions ADD COLUMN escalated_at TEXT;

UPDATE interactions SET escalated_at = asked_at;

UPDATE interactions
   SET card_id = (SELECT card_id FROM tickets WHERE tickets.id = interactions.ticket_id)
 WHERE card_id IS NULL;

CREATE INDEX idx_interactions_card_status ON interactions (card_id, status);
`,
};
