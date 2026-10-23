/**
 * Types for the server-side hook handler's injected dependencies.
 *
 * Why: the handler is where an untrusted harness event becomes a signed receipt, so
 *   everything it depends on is injected: who the run's token and secret belong to, how a
 *   run's grant and lane become an `AdmitContext`, the clock, and where receipts are
 *   stored. Keeping policy (`admit`) and secrets out of the handler's own code means the
 *   Director owns them, tests can stub them, and the storage backend can change without
 *   touching the chain logic. Receipts go through the `ReceiptLog` port from
 *   `@forge/tools`: one atomic step reads the chain tail and appends the next receipts,
 *   which is what keeps `seq` and `prev_hash` correct under concurrent hook posts. The
 *   run's HMAC secret only ever arrives through `credentials()` and is never persisted,
 *   so a Worker that can read the database file cannot forge a receipt.
 *
 * Exports: FailClosedCode, RunCredentials, AuditEntry, HookAudit, ApprovalAsk, ApprovalRaised, RaiseApproval, HookHandlerDeps,
 *   HookHandler.
 * Depends on: @forge/core (Run, StorageAdapter), @forge/tools (HookResponse, AdmitContext,
 *   AdmitCall, Decision, HmacKey, ReceiptLog). Types only.
 */

import type { Run, StorageAdapter } from '@forge/core';
import type {
  AdmitCall,
  AdmitContext,
  Decision,
  HmacKey,
  HookResponse,
  ReceiptLog,
} from '@forge/tools';

/** Why the handler refused; each maps to a `fail_closed_*` ReasonCode. */
export type FailClosedCode =
  | 'unknown_run'
  | 'no_credentials'
  | 'bad_token'
  | 'stale_generation'
  | 'inactive_run'
  | 'no_liveness'
  | 'bad_request'
  | 'internal';

/**
 * What the Director holds for a run: the bearer token the hook sends, the HMAC secret and the
 * secret generation they belong to (1, plus one per resume after a restart, d-0100).
 */
export interface RunCredentials {
  readonly token: string;
  readonly secret: HmacKey;
  readonly generation: number;
}

/** One refused request on a real run. Never written to the signed receipt chain. */
export interface AuditEntry {
  readonly ts: string;
  readonly code: 'bad_token' | 'internal';
  /** Refusals dropped by the per-run rate cap since the previous entry. */
  readonly suppressed: number;
}

/** Side-channel sink for refusals; must not throw into the request path (errors are ignored). */
export type HookAudit = (runId: string, entry: AuditEntry) => void | Promise<void>;

/** A call `admit()` marked `ask`, with the context and call that produced the verdict (lexical or physical). */
export interface ApprovalAsk {
  readonly run: Run;
  readonly ctx: AdmitContext;
  readonly call: AdmitCall;
  readonly decision: Decision;
  /** The harness's own id of the call, when it sent one. */
  readonly useId: string | undefined;
}

/** The owner's pending approval a raised ask points at. */
export interface ApprovalRaised {
  readonly interaction_id: string;
}

/**
 * Opens (or finds, for a repeated call) the owner's approval for an ask. Resolves `null` when it
 * was refused (run not live, Express, too many pending); a throw is treated the same way.
 */
export type RaiseApproval = (ask: ApprovalAsk) => Promise<ApprovalRaised | null>;

export interface HookHandlerDeps {
  /** Source of run rows (existence, lane, harness). */
  readonly db: StorageAdapter;
  readonly receipts: ReceiptLog;
  /** The single admission function from `@forge/tools`. */
  readonly admit: (ctx: AdmitContext, call: AdmitCall) => Decision;
  /**
   * Token, HMAC secret and generation for a run; null when the run has none (not started,
   * retired, or the server restarted and the run was not resumed yet). The token is held in
   * server memory only and the secret in the SecretStore; never read them from the database.
   */
  readonly credentials: (runId: string) => Promise<RunCredentials | null>;
  /** Builds the run's effective grant and catalogue view; the handler never builds grants. */
  readonly admitContext: (run: Run) => Promise<AdmitContext>;
  readonly clock: () => Date;
  /** Where refusals on a real run are reported; defaults to an in-memory buffer. */
  readonly audit?: HookAudit;
  /** Receipt id source; defaults to `crypto.randomUUID`. */
  readonly newId?: () => string;
  /**
   * Deny a run's tool calls until its hook has registered (`hook_registered_at`, d-0033).
   * A harness that never ran our SessionStart hook may not be running the PreToolUse hook
   * either; with this on, an unregistered run gets `fail_closed_no_liveness`. Default off.
   */
  readonly requireLiveness?: boolean;
  /**
   * True while the server drains for a graceful stop: a new PreToolUse is answered `deny`
   * with reason `server_draining` (receipted as a deny), so the calls already allowed can
   * finish and record their effect before runs are interrupted. PostToolUse is unaffected.
   */
  readonly draining?: () => boolean;
  /** Called on a valid SessionStart so the engine can register run liveness (d-0033). */
  readonly onLiveness?: (
    runId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  /**
   * The engine's door for a tool approval (hooks may not import the engine, so the server
   * injects it). With it an `ask` is answered `ask` / `awaiting_owner` with the interaction id,
   * or `deny` / `approval_unavailable` when no approval could be raised. Without it an `ask`
   * is answered as `admit()` judged it.
   */
  readonly raiseApproval?: RaiseApproval;
}

export interface HookHandler {
  /** Never throws. Anything wrong yields `deny` with reason `fail_closed_<code>`. */
  handle(runId: string, token: string, request: unknown): Promise<HookResponse>;
}
