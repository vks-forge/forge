/**
 * StorageAdapter port — repositories and the transaction boundary.
 *
 * Why: the Director's correctness rests on one writer applying every state change
 *   atomically and on stale writers losing. StorageAdapter encodes that contract: all
 *   work happens in a transaction, and ticket updates are compare-and-swap on
 *   `status_version`, so a Director tick and an API call racing on one ticket cannot
 *   both win and double-dispatch it. Intake inserts report duplicates so redeliveries
 *   are dropped, run events are append-only so the UI and replay have a trustworthy
 *   history whose `seq` is allocated by storage alone, run tokens are kept as hashes only
 *   so reading the database never yields a usable credential, and pending interactions are
 *   listable so no parked ticket is lost. Behind a port, the backend (SQLite WAL by
 *   default) can change without touching the engine (director-core.md §2-§3, §7-§8,
 *   d-0023).
 *
 * Exports: TicketPatch, TicketRepository, RunRepository, RunEventRepository,
 *   RunTokenRepository, IntakeEventRepository, InteractionRepository, StorageTx,
 *   StorageAdapter.
 * Depends on: schemas/ids, schemas/intake, schemas/interaction, schemas/run,
 *   schemas/ticket, types/run-event.types. No IO (interfaces only).
 */

import type { TicketId } from '#/schemas/ids.js';
import type { IntakeEvent } from '#/schemas/intake.js';
import type { Interaction } from '#/schemas/interaction.js';
import type { Run, RunEvent } from '#/schemas/run.js';
import type { Ticket, TicketStatus } from '#/schemas/ticket.js';
import type { NewRunEvent } from '#/types/run-event.types.js';

/** Fields a CAS update may change; identity and creation time are immutable and `status_version` belongs to storage. */
export type TicketPatch = Partial<
  Omit<Ticket, 'id' | 'project' | 'created_at' | 'status_version'>
>;

/** Ticket persistence with compare-and-swap updates (director-core.md §3). */
export interface TicketRepository {
  get(id: TicketId): Promise<Ticket | null>;
  listByStatus(status: TicketStatus): Promise<Ticket[]>;
  insert(ticket: Ticket): Promise<void>;
  // Applies `patch` only if the stored status_version equals expectedVersion, and sets
  // status_version to expectedVersion + 1. A patch carrying `status_version` is refused
  // (InvalidInputError): the version is storage's, not the caller's. A key present with
  // value `undefined` clears an optional column (`blocked_reason`, `tier_actual`,
  // `parent`), so a patch built from `transition()` output leaves no stale value.
  // false = stale writer lost (director-core.md §3).
  updateTicketCas(
    id: TicketId,
    expectedVersion: number,
    patch: TicketPatch,
  ): Promise<boolean>;
}

/** Persistence for `runs` rows (execution-plane.md §8 run lifecycle). */
export interface RunRepository {
  get(id: string): Promise<Run | null>;
  listByTicket(ticketId: string): Promise<Run[]>;
  insert(run: Run): Promise<void>;
  update(id: string, patch: Partial<Omit<Run, 'id'>>): Promise<void>;
}

/** Append-only store of normalized run events. */
export interface RunEventRepository {
  // Append-only. Storage is the one `seq` allocator: the event arrives without a seq and
  // is stored at max(seq)+1 for the run (0 for the first) inside the caller's transaction,
  // so concurrent writers (driver, MCP server) can never collide or leave gaps.
  append(runId: string, event: NewRunEvent): Promise<RunEvent>;
  listByRun(runId: string, afterSeq?: number): Promise<RunEvent[]>;
}

/**
 * Per-run bearer tokens, stored as SHA-256 hashes only. The per-run HMAC secret that
 * signs tool receipts is NOT stored here or anywhere on disk: a Worker that can read the
 * database file must not be able to forge receipts.
 */
export interface RunTokenRepository {
  // Registers the hash for `runId`. Replaces a live (unrevoked) hash, but throws
  // PolicyDeniedError when the run's token was revoked: a revoked token must never be
  // re-armed by accident (a late or replayed issue). Non-digests throw InvalidInputError.
  issue(runId: string, tokenSha256: string, issuedAt: string): Promise<void>;
  // The deliberate re-arm for a resumed run: replaces the hash and clears any revocation.
  reissue(runId: string, tokenSha256: string, issuedAt: string): Promise<void>;
  // Deprecated alias of `issue` (same refusal of revoked runs); new code calls `issue`.
  put(runId: string, tokenSha256: string, issuedAt: string): Promise<void>;
  // The stored hash, or null when none was issued or it was revoked.
  getHash(runId: string): Promise<string | null>;
  // Revokes the run's token; unknown runs are a no-op.
  revoke(runId: string, at: string): Promise<void>;
}

/** Idempotent store of raw intake events (director-core.md §7). */
export interface IntakeEventRepository {
  // false when (source, dedupe_key) was already stored: the duplicate is dropped.
  insertIfNew(event: IntakeEvent): Promise<boolean>;
}

/** Persistence for blocking questions and approvals (director-core.md §8). */
export interface InteractionRepository {
  get(id: string): Promise<Interaction | null>;
  listPending(): Promise<Interaction[]>;
  insert(interaction: Interaction): Promise<void>;
  update(id: string, patch: Partial<Omit<Interaction, 'id'>>): Promise<void>;
}

/** The repositories visible inside one transaction. */
export interface StorageTx {
  readonly tickets: TicketRepository;
  readonly runs: RunRepository;
  readonly runEvents: RunEventRepository;
  readonly intakeEvents: IntakeEventRepository;
  readonly interactions: InteractionRepository;
  readonly runTokens: RunTokenRepository;
}

/** Single-writer storage backend; every mutation happens inside `transaction` (director-core.md §2-§3). */
export interface StorageAdapter {
  transaction<T>(fn: (tx: StorageTx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
