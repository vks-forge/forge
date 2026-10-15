/**
 * Engine dependency bag, public engine interface and the per-tick report.
 *
 * Why: the engine is pure orchestration over ports (d-0058). Everything it touches that
 *   is not core or tools logic (storage, the Worker harness, the Director's model calls,
 *   git worktrees, project memory, the receipt chain, time, id generation, logging) comes
 *   in through `EngineDeps`, so the same code runs against SQLite and the real harness in
 *   `apps/server` and against in-memory fakes in tests. `TickReport` is what a tick hands
 *   back so the app, the control room and tests can see what changed, which invariants
 *   broke and which Director steps were rejected, without scraping logs.
 *
 * Exports: LogLevel, Logger, IdSource, EngineDeps, IngestResult, TickReport, SettledRun,
 *   Violation, RejectedStep, TickError, Engine.
 * Depends on: @forge/core (ports, schemas), @forge/tools (ReceiptLog). Types only.
 */

import type {
  Clock,
  ConfigSource,
  DirectorLLM,
  DriverRegistry,
  ErrorFamily,
  IntakeEvent,
  MemorySource,
  ProjectConfigView,
  ReportStore,
  RunStatus,
  StepName,
  StorageAdapter,
} from '@forge/core';
import type { ReceiptLog } from '@forge/tools';
import type { ProjectRuntime, VerifiedTicket } from '#/types/verify.types.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Logger = (
  level: LogLevel,
  message: string,
  fields?: Readonly<Record<string, unknown>>,
) => void;

/** Source of new ids and run tokens; injected so tests are deterministic and the engine does no crypto of its own. */
export interface IdSource {
  runId(): string;
  wakeId(): string;
  interactionId(): string;
  /** A fresh bearer token for one run; the engine stores only its SHA-256. */
  token(): string;
}

export interface EngineDeps {
  readonly storage: StorageAdapter;
  /** The harnesses this server runs, by id; a ticket's harness comes from its effective settings. */
  readonly drivers: DriverRegistry;
  readonly llm: DirectorLLM;
  readonly memory: MemorySource;
  readonly receipts: ReceiptLog;
  /** Where gate reports are saved; the returned reference goes on the `gate_results` row. */
  readonly reports: ReportStore;
  /**
   * The runtime (git host, gates, worktrees, base branch) for a project, or null when the
   * app has none (unknown or archived project). `settings` is the project's settings as of
   * this tick; the app compares its version with the one its runtime was built from and
   * rebuilds the runtime when the git host settings changed, so no restart is needed.
   */
  readonly project: (
    slug: string,
    settings: ProjectConfigView | undefined,
  ) => ProjectRuntime | null;
  readonly clock: Clock;
  /** Versioned settings in the database; read once at the start of every tick (d-0085). */
  readonly config: ConfigSource;
  readonly ids: IdSource;
  /** This server instance; a live run owned by anyone else was left by a restart or crash and is resumed or crash-settled (d-0092). */
  readonly owner: string;
  /**
   * SHA-256 of the effective tool catalogue a run on this harness is admitted under (the
   * catalogue version plus the harness build's approved native schemas); stored on the run row.
   */
  readonly catalogueHash: (harnessId: string) => Promise<string>;
  /** Server name the run's Forge MCP server is registered under (default `forge`). */
  readonly mcpIdentity?: string;
  /** Called (never re-entrantly, coalesced) when something wants an immediate tick; the app schedules `engine.tick()`. */
  readonly onTickRequested?: () => void;
  readonly log?: Logger;
}

/** What `ingest` did with an intake event. */
export type IngestResult =
  | { readonly status: 'ticket_created'; readonly ticketId: string }
  | { readonly status: 'duplicate' }
  | { readonly status: 'reply_queued'; readonly ticketId: string }
  | { readonly status: 'answered'; readonly interactionId: string }
  | { readonly status: 'ignored'; readonly reason: string };

export interface SettledRun {
  readonly runId: string;
  readonly ticketId: string;
  readonly status: RunStatus;
  readonly errorFamily?: ErrorFamily;
  readonly filesTouched: readonly string[];
}

/** A broken engine invariant (director-core.md §3); surfaced, never silently retried. */
export interface Violation {
  readonly ticketId: string;
  readonly rule: 'in_progress_without_reason_to_wait' | 'waiting_human_without_reason';
  readonly message: string;
}

export interface RejectedStep {
  readonly step: StepName;
  readonly ticketId: string;
  readonly reason: string;
}

export interface TickError {
  readonly where: string;
  readonly message: string;
}

/** Everything one tick did. */
export interface TickReport {
  readonly at: string;
  readonly firstTick: boolean;
  readonly crashed: string[];
  /** Interrupted or lost runs the restart reconcile resumed from their harness session (d-0092). */
  readonly resumed: string[];
  /** Interrupted runs that could not be resumed; settled as a crash and retried as a new run. */
  readonly resumeFailed: string[];
  readonly settled: SettledRun[];
  readonly triaged: { ticketId: string; lane: string; parked: boolean }[];
  readonly dispatched: {
    ticketId: string;
    runId: string;
    kind: 'new' | 'retry' | 'resume';
  }[];
  readonly steered: { ticketId: string; runId: string; mode: string }[];
  readonly verified: VerifiedTicket[];
  readonly parked: { ticketId: string; reason: string }[];
  readonly violations: Violation[];
  readonly rejectedSteps: RejectedStep[];
  readonly errors: TickError[];
}

/** The Director engine: one writer, driven by the app's clock. */
export interface Engine {
  /** Reconcile, refresh, dispatch. Single-flight: a call during a tick returns the running tick's report. */
  tick(): Promise<TickReport>;
  /** Asks for an immediate tick through `deps.onTickRequested`; calls coalesce. */
  requestTick(): void;
  /** Stores an intake event (deduped) and maps it: new request -> inbox ticket, reply -> steering or an answer. */
  ingest(event: IntakeEvent): Promise<IngestResult>;
  /** Answers a pending interaction (CAS) and queues the response wake. False when it was not pending. */
  answerInteraction(interactionId: string, answer: unknown): Promise<boolean>;
  /** Cancels a ticket through `transition()` and stops its live run. False when the ticket is terminal or unknown. */
  cancelTicket(ticketId: string): Promise<boolean>;
  /** Why the ticket has not started (`quota: claude-code until 14:20 UTC`, `cap: per-project 1/1`, `deps: PAY-231`), or null when nothing holds it back. Read-only. */
  explainWait(ticketId: string): Promise<string | null>;
  /**
   * Shutdown: marks a live run `interrupted` (its session, worktree, token and receipts are
   * kept for the next start to resume, d-0092) and stops its harness. Unknown runs and runs
   * whose result already arrived are left alone.
   */
  interruptRun(runId: string): Promise<void>;
  /** Projects the last tick skipped because their stored settings no longer validate, slug to reason. */
  unservableProjects(): ReadonlyMap<string, string>;
  /** Ids of runs with a live pump in this process. */
  liveRunIds(): string[];
  /** Gate runs currently executing in the background (finished ones await the next tick). */
  gateJobsInFlight(): number;
}
