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
 * Exports: ProjectRuntime, MergeOpts, ReviewedExtras, ReadyRuntime, VerifyTarget, GateRun, GateRows, GateSummary, GateJob, GateJobOutcome, MergeOutcome, VerifyOutcome, VerifiedTicket.
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
  StorageTx,
  Ticket,
  Tier,
  ScriptGateRunner,
  WorktreeManager,
  WorktreePreparer,
} from '@forge/core';

/**
 * Everything the engine needs to work on one project, built by the app: the project's
 * identity, its git host (null when the settings name none), its gates (run in order), the
 * worktrees cut from its own clone and the base branch they start from.
 */
export interface ProjectRuntime {
  readonly config: ProjectConfig;
  readonly gitHost: GitHost | null;
  readonly gates: readonly Gate[];
  readonly worktrees: WorktreeManager;
  /** Base used when the project's settings name no git host. */
  readonly baseRef: string;
  /** Runs owner-written script gates and the red proof; absent means those stages cannot run (a script gate parks, a red proof is skipped). */
  readonly scriptGates?: ScriptGateRunner;
  /** Gets a fresh worktree ready (installs packages); absent means no setup, as for a project with nothing to install (d-0180). */
  readonly prepare?: WorktreePreparer;
}

/** A runtime that can publish: verifying needs a git host. */
export type ReadyRuntime = ProjectRuntime & { readonly gitHost: GitHost };

/** One ticket in Verifying with the run being judged and everything resolved for it. */
export interface VerifyTarget {
  readonly ticket: Ticket;
  readonly run: Run;
  readonly project: Project;
  readonly runtime: ReadyRuntime;
  /** Worktree path of the ticket. */
  readonly worktree: string;
  readonly branch: string;
  /** The project's base branch: worktree base, diff base and PR target are all this one ref. */
  readonly baseRef: string;
  readonly baseSha: string;
}

/**
 * What bringing main into a branch led to: `ready` with the base the branch now diverges from (the base
 * tip once main was merged in; the diff and the checks must start from it), or `handled` when a clash
 * went to the writer.
 */
export type BaseSync =
  { readonly kind: 'ready'; readonly baseSha: string } | { readonly kind: 'handled' };

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

/**
 * How the merge door is asked to treat a ticket whose stages all passed: `hold` waits for the owner
 * even at tier A (a human or sign-off stage is open); `directorSigned` means the sign-off stage's
 * Director signed (tier C only on a clean floor, d-0181); `declined` carries why the Director did not sign.
 */
export interface MergeOpts {
  readonly hold: boolean;
  readonly directorSigned?: boolean;
  readonly declined?: string;
  /** The Director's reasons, written on the card note when it signs tier B or C. */
  readonly signReason?: string;
  /** The tier the sign-off row says the Director signed; tier C passes the door only when this is `C` (d-0181). */
  readonly signedTier?: Tier;
}

/** What a caller adds to an approval: a card note in place of the default, and writes that join the move to done. */
export interface ReviewedExtras {
  readonly note?: string;
  /** Appended to the card note when the merge rests on a check the owner overruled; empty when none. */
  readonly overrideNote?: string;
  readonly beforeMove?: (tx: StorageTx) => Promise<void>;
  /** The Director signs a clean tier C change (d-0181); the move to done carries `clean_floor`. */
  readonly cleanFloor?: boolean;
}

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
