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
 * Exports: FailClosedCode, RunCredentials, AuditEntry, HookAudit, HookHandlerDeps, HookHandler.
 * Depends on: @forge/core (Run, StorageAdapter), @forge/tools (AdmitContext, AdmitCall,
 *   Decision, HmacKey, ReceiptLog), schemas/hook-wire. Types only.
 */

import type { Run, StorageAdapter } from '@forge/core';
import type {
  AdmitCall,
  AdmitContext,
  Decision,
  HmacKey,
  ReceiptLog,
} from '@forge/tools';
import type { HookResponse } from '#/schemas/hook-wire.js';

/** Why the handler refused; each maps to a `fail_closed_*` ReasonCode. */
export type FailClosedCode =
  'unknown_run' | 'no_credentials' | 'bad_token' | 'bad_request' | 'internal';

/** What the Director holds for a run: the bearer token the hook sends and the HMAC secret. */
export interface RunCredentials {
  readonly token: string;
  readonly secret: HmacKey;
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

export interface HookHandlerDeps {
  /** Source of run rows (existence, lane, harness). */
  readonly db: StorageAdapter;
  readonly receipts: ReceiptLog;
  /** The single admission function from `@forge/tools`. */
  readonly admit: (ctx: AdmitContext, call: AdmitCall) => Decision;
  /**
   * Token + HMAC secret for a run; null when the run has none (not started, revoked). The
   * secret is held in server memory only; never read it back from the database.
   */
  readonly credentials: (runId: string) => Promise<RunCredentials | null>;
  /** Builds the run's effective grant and catalogue view; the handler never builds grants. */
  readonly admitContext: (run: Run) => Promise<AdmitContext>;
  readonly clock: () => Date;
  /** Where refusals on a real run are reported; defaults to an in-memory buffer. */
  readonly audit?: HookAudit;
  /** Receipt id source; defaults to `crypto.randomUUID`. */
  readonly newId?: () => string;
  /** Called on a valid SessionStart so the engine can register run liveness (d-0033). */
  readonly onLiveness?: (
    runId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
}

export interface HookHandler {
  /** Never throws. Anything wrong yields `deny` with reason `fail_closed_<code>`. */
  handle(runId: string, token: string, request: unknown): Promise<HookResponse>;
}
