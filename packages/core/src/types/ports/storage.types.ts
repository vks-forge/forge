/**
 * StorageAdapter port — repositories and the transaction boundary.
 *
 * Why: the Director's correctness rests on one writer applying every state change
 *   atomically and on stale writers losing. StorageAdapter encodes that contract: all
 *   work happens in a transaction, and ticket updates are compare-and-swap on
 *   `status_version`, so a Director tick and an API call racing on one ticket cannot
 *   both win and double-dispatch it. Intake inserts report duplicates so redeliveries
 *   are dropped, run events are append-only with `seq` allocated by storage alone, run
 *   tokens are kept as hashes only, and pending interactions are answered by
 *   compare-and-swap so a human and a timeout cannot both resolve one. The work queues the
 *   engine tick reads, and the read and archive marks of the Inbox, sit behind the same
 *   transaction. Behind a port, the backend (SQLite WAL by default) can change without
 *   touching the engine (director-core.md §2-§3, §7-§8, d-0023).
 *
 * Cards, their history and the type registry (ports/card.types), card planning state and
 * plan versions (ports/card-planning.types) and the harness registries
 * (ports/harness-registry.types) join the same transaction.
 *
 * Exports: TicketPatch, TicketRepository, TicketRelationRepository, RunRepository,
 *   RunEventRepository, RunInboxRepository, RunTokenRepository, IntakeEventRepository,
 *   InteractionRepository, WakeRequestRepository, GateResultRepository, ProjectRepository,
 *   GithubConnectionRepository, StorageTx, StorageAdapter.
 * Depends on: schemas/*, types/run-event.types. No IO (interfaces only).
 */

import type { CardId, TicketId } from '#/schemas/ids.js';
import type { GateResult, NewGateResult } from '#/schemas/gate-result.js';
import type { IntakeEvent, StoredIntakeEvent } from '#/schemas/intake.js';
import type { Interaction } from '#/schemas/interaction.js';
import type {
  HarnessRepository,
  HarnessStateRepository,
  HarnessToolSchemaRepository,
  HarnessVersionRepository,
} from '#/types/ports/harness-registry.types.js';
import type {
  CardEventRepository,
  CardRelationRepository,
  CardReplyQueueRepository,
  CardRepository,
  CardTypeRepository,
} from '#/types/ports/card.types.js';
import type { CardPlanningRepository } from '#/types/ports/card-planning.types.js';
import type { InboxStateRepository } from '#/types/ports/inbox-state.types.js';
import type { GithubConnection } from '#/schemas/github-connection.js';
import type { Project } from '#/schemas/project.js';
import type { NewRunInboxMessage, RunInboxMessage } from '#/schemas/run-inbox.js';
import type { Run, RunEvent, RunStatus } from '#/schemas/run.js';
import type { TicketRelation } from '#/schemas/ticket-relation.js';
import type { Ticket, TicketRelationKind, TicketStatus } from '#/schemas/ticket.js';
import type { NewWakeRequest, WakeKind, WakeRequest } from '#/schemas/wake-request.js';
import type { NewRunEvent } from '#/types/run-event.types.js';
import type { RunListFilter } from '#/types/run-list.types.js';
import type { TicketListFilter } from '#/types/ticket-list.types.js';

/**
 * Fields a CAS update may change; identity and creation time are immutable,
 * `status_version` belongs to storage, and `parent` / `blocked_by` are derived from
 * `ticket_relations` (change them through `TicketRelationRepository`).
 */
export type TicketPatch = Partial<
  Omit<
    Ticket,
    | 'id'
    | 'project'
    | 'card_id'
    | 'created_at'
    | 'status_version'
    | 'parent'
    | 'blocked_by'
  >
>;

/**
 * Ticket persistence with compare-and-swap updates (director-core.md §3). `Ticket.parent`
 * and `Ticket.blocked_by` are derived on every read from `ticket_relations`, the single
 * source of truth (see `TicketRelationRepository`).
 */
export interface TicketRepository {
  get(id: TicketId): Promise<Ticket | null>;
  listByStatus(status: TicketStatus): Promise<Ticket[]>;
  // Every ticket of one card, oldest first (insertion order).
  listByCard(cardId: CardId): Promise<Ticket[]>;
  // One project's tickets, newest `updated_at` first, `id` descending as tie-break (a total
  // order). `after` is the previous page's last row (exclusive); non-empty `statuses` narrows.
  listByProject(project: string, filter: TicketListFilter): Promise<Ticket[]>;
  // Stores the ticket row. A `parent` or `blocked_by` is recorded as relation rows in the same
  // transaction (`spawned_from` / `depends_on`); from then on relations change only through
  // `ticketRelations`.
  insert(ticket: Ticket): Promise<void>;
  // Applies `patch` only if status_version equals expectedVersion, then sets it to
  // expectedVersion + 1. A patch carrying `status_version` is refused (InvalidInputError).
  // A key present with value `undefined` clears an optional column, so a patch built from
  // `transition()` output leaves no stale value. false = stale writer lost (director-core.md §3).
  updateTicketCas(
    id: TicketId,
    expectedVersion: number,
    patch: TicketPatch,
  ): Promise<boolean>;
}

/**
 * Typed edges between tickets, the one source of truth for parent and blocker links
 * (director-core.md §3). Read as "`from_id` <kind> `to_id`".
 */
export interface TicketRelationRepository {
  // false when the exact (from, to, kind) edge already exists. Invalid edges (a ticket to
  // itself, malformed ids) throw InvalidInputError.
  add(relation: TicketRelation): Promise<boolean>;
  // false when there was no such edge.
  remove(fromId: TicketId, toId: TicketId, kind: TicketRelationKind): Promise<boolean>;
  // Every edge with the ticket at either end, in insertion order.
  listFor(ticketId: TicketId): Promise<TicketRelation[]>;
}

/**
 * Persistence for `runs` rows (execution-plane.md §8 run lifecycle). A run with `ended_at`
 * is never reopened: `update` refuses to clear `ended_at` or set `starting` / `running` on
 * an ended run (InvalidInputError); resuming is a new row whose `retry_of` names the old one.
 */
export interface RunRepository {
  get(id: string): Promise<Run | null>;
  listByTicket(ticketId: string): Promise<Run[]>;
  // Runs in any of the given statuses, oldest first (reconcile and the stall scan).
  listByStatus(statuses: readonly RunStatus[]): Promise<Run[]>;
  // Newest `started_at` first, `id` descending as tie-break; `project` matches the run's ticket's
  // project; `after` is the previous page's last row (exclusive). See `RunListFilter`.
  list(filter: RunListFilter): Promise<Run[]>;
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
  put(runId: string, tokenSha256: string, issuedAt: string): Promise<void>;
  // The stored hash, or null when none was issued or it was revoked.
  getHash(runId: string): Promise<string | null>;
  // Revokes the run's token; unknown runs are a no-op.
  revoke(runId: string, at: string): Promise<void>;
}

/**
 * Durable queue of steering messages for live runs (director-core.md §8). Storage is the
 * only `seq` allocator (0-based, max+1 per run), as for run events.
 */
export interface RunInboxRepository {
  append(message: NewRunInboxMessage): Promise<RunInboxMessage>;
  // Messages not yet delivered, in seq order.
  listUndelivered(runId: string): Promise<RunInboxMessage[]>;
  // Stamps `delivered_at`; false when the message is unknown or was already delivered.
  markDelivered(runId: string, seq: number, at: string): Promise<boolean>;
}

/** Idempotent store of raw intake events (director-core.md §7). */
export interface IntakeEventRepository {
  // `inserted: false` when (source, dedupe_key) was already stored: the duplicate is
  // dropped and `event` is the first stored copy. Either way `event.id` is the stored id.
  insertIfNew(
    event: IntakeEvent,
  ): Promise<{ inserted: boolean; event: StoredIntakeEvent }>;
  // Records which ticket the event became. false when the event is unknown or already
  // mapped (the first mapping stands).
  markTicket(id: number, ticketId: TicketId): Promise<boolean>;
  // The stored event by id (what `tickets.created_by_intake` points at), or null.
  get(id: number): Promise<StoredIntakeEvent | null>;
}

/** Persistence for blocking questions and approvals (director-core.md §8). */
export interface InteractionRepository {
  get(id: string): Promise<Interaction | null>;
  listPending(): Promise<Interaction[]>;
  listByTicket(ticketId: string): Promise<Interaction[]>;
  insert(interaction: Interaction): Promise<void>;
  update(id: string, patch: Partial<Omit<Interaction, 'id'>>): Promise<void>;
  // Compare-and-swap on `status = 'pending'`: true only for the writer that moved it to
  // `answered`; a second answer, or one after a timeout or cancel, gets false.
  answer(id: string, answer: unknown, at: string): Promise<boolean>;
  // Same CAS to `timed_out`, only once `timeout_at <= at`. false when not pending or not due.
  expire(id: string, at: string): Promise<boolean>;
  // Moves a pending interaction from the Director's stage to the owner's: replaces `payload` and
  // sets `escalated_at` (`patch.escalated_at`, else `at`). CAS on `status = 'pending' AND
  // escalated_at IS NULL`: false when it is unknown, answered, timed out, cancelled or already
  // escalated, so a late escalation never overwrites an answer and never moves the date.
  escalate(
    id: string,
    patch: { payload: unknown; escalated_at?: string },
    at: string,
  ): Promise<boolean>;
  // The card's pending interactions (any stage), oldest first.
  listPendingByCard(cardId: string): Promise<Interaction[]>;
}

/** Durable "look at this ticket again" queue (director-core.md §3). */
export interface WakeRequestRepository {
  // Idempotent on (ticket_id, reason, idempotency_key): a duplicate increments the stored
  // `coalesced_count` and returns `inserted: false` with the stored row.
  insertIfNew(
    request: NewWakeRequest,
  ): Promise<{ inserted: boolean; request: WakeRequest }>;
  // Pending wakes whose `not_before` is absent or <= `now`, oldest first.
  listDue(now: string): Promise<WakeRequest[]>;
  // pending -> consumed; false when unknown or already consumed.
  markConsumed(id: string, at: string): Promise<boolean>;
  // Wakes created at or after `since` (coalesced duplicates do not count), optionally only
  // of the given kinds: the input to the automated re-wake cap.
  countSince(
    ticketId: string,
    since: string,
    kinds?: readonly WakeKind[],
  ): Promise<number>;
}

/** Gate verdicts, read back per ticket through the runs they judged (verification-plane.md). */
export interface GateResultRepository {
  insert(result: NewGateResult): Promise<GateResult>;
  // Results for every run of the ticket, oldest first.
  listByTicket(ticketId: string): Promise<GateResult[]>;
}

/** The `projects` registry (director-core.md §3). */
export interface ProjectRepository {
  get(id: string): Promise<Project | null>;
  // Insert or replace by id.
  upsert(project: Project): Promise<void>;
  // Remove the row (undoing a registration that did not complete); false when there was none.
  delete(id: string): Promise<boolean>;
  // Remove the project and everything it owns (tickets, runs and their records, cards, inbox
  // marks) in the caller's transaction; settings history stays. False when the slug is unknown.
  purge(slug: string): Promise<boolean>;
  list(): Promise<Project[]>;
}

/** The `github_connections` registry (d-0094): one GitHub App per org or account. Keys live in the SecretStore. */
export interface GithubConnectionRepository {
  get(id: string): Promise<GithubConnection | null>;
  // Insert or replace by id.
  upsert(connection: GithubConnection): Promise<void>;
  // Insert only: false (and nothing written) when a connection with that id exists.
  insertIfAbsent(connection: GithubConnection): Promise<boolean>;
  // Remove the row; false when there was none.
  delete(id: string): Promise<boolean>;
  // Oldest first.
  list(): Promise<GithubConnection[]>;
}

/** The repositories visible inside one transaction. */
export interface StorageTx {
  readonly tickets: TicketRepository;
  readonly runs: RunRepository;
  readonly runEvents: RunEventRepository;
  readonly intakeEvents: IntakeEventRepository;
  readonly interactions: InteractionRepository;
  readonly runTokens: RunTokenRepository;
  readonly runInbox: RunInboxRepository;
  readonly wakeRequests: WakeRequestRepository;
  readonly gateResults: GateResultRepository;
  readonly projects: ProjectRepository;
  readonly harnesses: HarnessRepository;
  readonly harnessState: HarnessStateRepository;
  readonly githubConnections: GithubConnectionRepository;
  readonly harnessVersions: HarnessVersionRepository;
  readonly harnessToolSchemas: HarnessToolSchemaRepository;
  readonly ticketRelations: TicketRelationRepository;
  readonly inboxStates: InboxStateRepository;
  readonly cards: CardRepository;
  readonly cardEvents: CardEventRepository;
  readonly cardTypes: CardTypeRepository;
  readonly cardRelations: CardRelationRepository;
  readonly cardReplyQueue: CardReplyQueueRepository;
  readonly cardPlanning: CardPlanningRepository;
}

/** Single-writer storage backend; every mutation happens inside `transaction`. */
export interface StorageAdapter {
  transaction<T>(fn: (tx: StorageTx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
