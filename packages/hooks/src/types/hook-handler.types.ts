/**
 * Types for the server-side hook handler and its receipt log port.
 *
 * Why: the handler is where an untrusted harness event becomes a signed receipt, so
 *   everything it depends on is injected: who the run's token and secret belong to, how a
 *   run's grant and lane become an `AdmitContext`, the clock, and where receipts are
 *   stored. Keeping policy (`admit`) and secrets out of the handler's own code means the
 *   Director owns them, tests can stub them, and the storage backend can change without
 *   touching the chain logic. The receipt log is a port because `@forge/db` has no
 *   repository for `tool_decisions` / `tool_effects` yet; the port is shaped so one
 *   transaction reads the chain tail and appends the next receipts, which is what keeps
 *   `seq` and `prev_hash` correct under concurrent hook posts.
 *
 * Exports: FailClosedCode, RunCredentials, ChainView, ReceiptLog, HookHandlerDeps, HookHandler.
 * Depends on: @forge/core (Run, StorageAdapter), @forge/tools (AdmitContext, AdmitCall,
 *   Decision, Receipt, DecisionReceipt, HmacKey), schemas/hook-wire. Types only.
 */

import type { Run, StorageAdapter } from '@forge/core';
import type {
  AdmitCall,
  AdmitContext,
  Decision,
  DecisionReceipt,
  HmacKey,
  Receipt,
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

/** Read access to a run's chain, valid only inside `ReceiptLog.append`. */
export interface ChainView {
  /** Last receipt of either kind, or null for an empty chain. */
  readonly last: Receipt | null;
  /** `seq` of the last decision, 0 for an empty chain. */
  readonly lastSeq: number;
  /** Decision with this id that has no effect receipt yet. */
  openDecision(id: string): DecisionReceipt | null;
  /** Most recent decision for `tool` that has no effect receipt yet. */
  latestOpenDecision(tool: string): DecisionReceipt | null;
}

/**
 * Append-only per-run receipt store. `append` must serialise per run and be atomic: it
 * calls `build` with the current chain view and stores everything `build` returns, or
 * nothing if `build` throws.
 */
export interface ReceiptLog {
  append(
    runId: string,
    build: (view: ChainView) => readonly Receipt[],
  ): Promise<readonly Receipt[]>;
  list(runId: string): Promise<readonly Receipt[]>;
}

export interface HookHandlerDeps {
  /** Source of run rows (existence, lane, harness). */
  readonly db: StorageAdapter;
  readonly receipts: ReceiptLog;
  /** The single admission function from `@forge/tools`. */
  readonly admit: (ctx: AdmitContext, call: AdmitCall) => Decision;
  /** Token + HMAC secret for a run; null when the run has none (not started, revoked). */
  readonly credentials: (runId: string) => Promise<RunCredentials | null>;
  /** Builds the run's effective grant and catalogue view; the handler never builds grants. */
  readonly admitContext: (run: Run) => Promise<AdmitContext>;
  readonly clock: () => Date;
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
