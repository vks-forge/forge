/**
 * StorageAdapter port — repositories and the transaction boundary.
 *
 * Why: the Director's correctness rests on one writer applying every state change
 *   atomically and on stale writers losing. StorageAdapter encodes that contract: all
 *   work happens in a transaction, and ticket updates are compare-and-swap on
 *   `status_version`, so a Director tick and an API call racing on one ticket cannot
 *   both win and double-dispatch it. Intake inserts report duplicates so redeliveries
 *   are dropped, run events are append-only so the UI and replay have a trustworthy
 *   history, and pending interactions are listable so no parked ticket is lost. Behind a
 *   port, the backend (SQLite WAL by default) can change without touching the engine
 *   (director-core.md §2-§3, §7-§8, d-0023).
 *
 * Exports: TicketPatch, TicketRepository, RunRepository, RunEventRepository,
 *   IntakeEventRepository, InteractionRepository, StorageTx, StorageAdapter.
 * Depends on: schemas/ids, schemas/intake, schemas/interaction, schemas/run,
 *   schemas/ticket. No IO (interfaces only).
 */

import type { TicketId } from '#/schemas/ids.js';
import type { IntakeEvent } from '#/schemas/intake.js';
import type { Interaction } from '#/schemas/interaction.js';
import type { Run, RunEvent } from '#/schemas/run.js';
import type { Ticket, TicketStatus } from '#/schemas/ticket.js';

/** Fields a CAS update may change; identity and creation time are immutable. */
export type TicketPatch = Partial<Omit<Ticket, 'id' | 'project' | 'created_at'>>;

/** Ticket persistence with compare-and-swap updates (director-core.md §3). */
export interface TicketRepository {
  get(id: TicketId): Promise<Ticket | null>;
  listByStatus(status: TicketStatus): Promise<Ticket[]>;
  insert(ticket: Ticket): Promise<void>;
  // Applies `patch` only if the stored status_version equals expectedVersion.
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
  // Append-only; seq is supplied by the run's event stream.
  append(runId: string, event: RunEvent): Promise<void>;
  listByRun(runId: string, afterSeq?: number): Promise<RunEvent[]>;
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
}

/** Single-writer storage backend; every mutation happens inside `transaction` (director-core.md §2-§3). */
export interface StorageAdapter {
  transaction<T>(fn: (tx: StorageTx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
