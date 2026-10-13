/**
 * Shapes of the verify phase: the per-project runtime, the target under verification and
 * its report entries.
 *
 * Why: after a Worker run succeeds the Director must publish the branch, judge it with
 *   independent gates and then merge or hand back. What it needs for that differs per
 *   project (which git host, which gates) and is only known at run time, so the app
 *   supplies a `ProjectRuntime` per project and the engine stays free of IO. The records
 *   below carry one ticket through those steps and report what happened to it.
 *
 * Exports: ProjectRuntime, VerifyTarget, GateRun, GateRows, GateSummary, GateJob, GateJobOutcome, MergeOutcome, VerifyOutcome, VerifiedTicket.
 * Depends on: @forge/core (ports, schemas). Types only.
 */

import type {
  ErrorFamily,
  Gate,
  GateResult,
  GateStatus,
  GateVerdict,
  GitHost,
  Project,
  ProjectConfig,
  Run,
  Ticket,
} from '@forge/core';

/** What verifying a project's tickets needs: its config, its git host and its gates (run in order). */
export interface ProjectRuntime {
  readonly config: ProjectConfig;
  readonly gitHost: GitHost;
  readonly gates: readonly Gate[];
}

/** One ticket in Verifying with the run being judged and everything resolved for it. */
export interface VerifyTarget {
  readonly ticket: Ticket;
  readonly run: Run;
  readonly project: Project;
  readonly runtime: ProjectRuntime;
  /** Worktree path of the ticket. */
  readonly worktree: string;
  readonly branch: string;
  /** The project's base branch: worktree base, diff base and PR target are all this one ref. */
  readonly baseRef: string;
  readonly baseSha: string;
}

/** The latest `gate_results` row per gate for one run. */
export type GateRows = readonly GateResult[];

/** What running the gates produced: their rows, verdicts by gate and the family of the first gate that threw. */
export interface GateRun {
  readonly rows: GateResult[];
  readonly verdicts: Map<string, GateVerdict>;
  readonly errorFamily?: ErrorFamily;
}

/** How a background gate run ended; stored rows are already written when this is set. */
export type GateJobOutcome =
  | { readonly ok: true; readonly run: GateRun }
  | { readonly ok: false; readonly error: unknown };

/** One gate run in flight (or just finished and not yet applied by a tick). */
export interface GateJob {
  readonly ticketId: string;
  readonly runId: string;
  /** The commit the gates are judging. */
  readonly headSha: string;
  /** Set once, when the gates are done; the next tick consumes the job. */
  outcome?: GateJobOutcome;
  /** Settles when the gates are done and the outcome is set (tests and shutdown await it). */
  done: Promise<void>;
}

/** What the gate rows say together; failures outrank errors, and any non-pass blocks the merge. */
export type GateSummary =
  | { readonly kind: 'pass' }
  | { readonly kind: 'fail'; readonly gates: readonly string[] }
  | { readonly kind: 'error'; readonly gates: readonly string[] };

/** `done`: the cycle ended (merged, or handed to a human). `regate`: the PR head moved and the gates must judge it again. */
export type MergeOutcome = 'done' | 'regate';

export type VerifyOutcome =
  'merged' | 'review' | 'needs_signoff' | 'rework' | 'parked' | 'retry_scheduled';

/** One entry of `TickReport.verified`. */
export interface VerifiedTicket {
  readonly ticketId: string;
  readonly runId: string;
  readonly outcome: VerifyOutcome;
  readonly gates: readonly { readonly gate: string; readonly status: GateStatus }[];
  /** Park reason, retry family or similar. */
  readonly detail?: string;
  readonly errorFamily?: ErrorFamily;
}
