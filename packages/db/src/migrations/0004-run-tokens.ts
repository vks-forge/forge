/**
 * Migration 0004: run tokens, and a unified chain position on tool decisions.
 *
 * Why: two things the running system was missing. (1) The MCP server and the hook both
 *   prove a caller holds the bearer token the driver issued for one run, so the database
 *   must remember a token per run, as a SHA-256 hash only: the per-run HMAC secret that
 *   signs receipts is deliberately never stored, because a Worker that can read this
 *   file must not be able to forge receipts or speak as its run, and a revoked token
 *   must stop working at once (`revoked_at`). (2) Receipt decisions and effects form one
 *   interleaved chain per run, but only effects had a chain position (0003). Without one
 *   on decisions, the interleaving cannot be rebuilt from rows and a reader could not
 *   tell a truncated tail from a short chain. `chain_seq` is the 1-based position in the
 *   run's chain across both tables; the unique indexes ignore position 0 so rows written
 *   before the chain existed stay valid. `run_events (run_id, seq)` is already the
 *   primary key, which is what makes storage-allocated event numbering safe
 *   (tool-system.md §10, verification-plane.md §2, execution-plane.md §8).
 *
 * Exports: MIGRATION_0004.
 * Depends on: types/migrations.types. No IO.
 */

import type { Migration } from '#/types/migrations.types.js';

export const MIGRATION_0004: Migration = {
  id: 4,
  name: 'run-tokens',
  sql: `
CREATE TABLE run_tokens (
  run_id       TEXT PRIMARY KEY,
  token_sha256 TEXT NOT NULL,
  issued_at    TEXT NOT NULL,
  revoked_at   TEXT
);

ALTER TABLE tool_decisions ADD COLUMN chain_seq INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_tool_decisions_run_chain ON tool_decisions (run_id, chain_seq) WHERE chain_seq > 0;
CREATE UNIQUE INDEX idx_tool_effects_run_chain_unique ON tool_effects (run_id, chain_seq) WHERE chain_seq > 0;
`,
};
