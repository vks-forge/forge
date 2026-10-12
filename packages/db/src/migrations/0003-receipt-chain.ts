/**
 * Migration 0003: receipt chain columns on tool_decisions, tool_effects and runs.
 *
 * Why: tool receipts form one HMAC chain per run that interleaves decision and effect
 *   rows. Verifiers must replay it in order, explain why a call was allowed or denied,
 *   follow nested calls to their parent, and detect a truncated tail. That needs the
 *   decision `reason`, a `parent_call_id`, a `run_id` and `chain_seq` on effects (which
 *   had neither), and the final chain hash recorded on the run row. Existing effect rows
 *   get the '' / 0 defaults; they predate the chain and are not replayable (tool-system.md
 *   §10, verification-plane.md §2).
 *
 * Exports: MIGRATION_0003.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0003: Migration = {
  id: 3,
  name: 'receipt-chain',
  sql: `
ALTER TABLE tool_decisions ADD COLUMN reason TEXT;
ALTER TABLE tool_decisions ADD COLUMN parent_call_id TEXT;

ALTER TABLE tool_effects ADD COLUMN run_id TEXT NOT NULL DEFAULT '';
ALTER TABLE tool_effects ADD COLUMN chain_seq INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_tool_effects_run_chain ON tool_effects (run_id, chain_seq);

ALTER TABLE runs ADD COLUMN final_chain_hash TEXT;
`,
};
