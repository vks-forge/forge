/**
 * Builds the hook ingress the harness calls on every tool event.
 *
 * Why: the hook route is the one policy door for Worker tool calls (`admit()`, signed
 *   receipts, liveness). Wiring its dependencies (run secrets, the effective catalogue,
 *   the liveness recorder that wakes the tick, the audit line for refused requests) is
 *   a self-contained step, kept apart so the composition root stays readable. It also makes
 *   the shutdown drain, the one switch the handler reads and the shutdown sequence flips. An `ask`
 *   is parked for the owner through the engine's `raiseToolApproval`, joined to the handler by
 *   services/approval-raiser (d-0175).
 *
 * Exports: createHooks().
 * Depends on: @forge/core, @forge/engine (Logger, tool-approval types), @forge/hooks, @forge/tools (admit),
 *   services/{approval-raiser,drain,tool-policy}. No IO of its own.
 */

import type { StorageAdapter } from '@forge/core';
import type { Logger, ToolApprovalRequest, ToolApprovalResult } from '@forge/engine';
import { createHookHandler, createLivenessRecorder } from '@forge/hooks';
import type { HookHandler, RunSecretRegistry } from '@forge/hooks';
import { admit } from '@forge/tools';
import type { ReceiptLog } from '@forge/tools';
import { createApprovalRaiser } from '#/services/approval-raiser.js';
import { createDrain } from '#/services/drain.js';
import type { Drain } from '#/types/drain.types.js';
import type { ToolPolicy } from '#/types/server.types.js';

export function createHooks(deps: {
  readonly storage: StorageAdapter;
  readonly receipts: ReceiptLog;
  readonly registry: RunSecretRegistry;
  readonly policy: ToolPolicy;
  readonly now: () => number;
  readonly requestTick: () => void;
  /** The engine's door for a call that hit `ask`. */
  readonly raiseToolApproval: (r: ToolApprovalRequest) => Promise<ToolApprovalResult>;
  readonly log: Logger;
}): { readonly handler: HookHandler; readonly drain: Drain } {
  const { storage, now } = deps;
  // One switch for both sides: the handler refuses new calls while the shutdown waits.
  const drain = createDrain({ receipts: deps.receipts });

  const handler = createHookHandler({
    db: storage,
    receipts: deps.receipts,
    admit,
    credentials: deps.registry.credentials,
    admitContext: deps.policy.admitContext,
    clock: () => new Date(now()),
    requireLiveness: true,
    draining: drain.isDraining,
    raiseApproval: createApprovalRaiser(deps.raiseToolApproval),
    onLiveness: createLivenessRecorder({
      storage,
      now: () => new Date(now()),
      onRegistered: deps.requestTick,
    }),
    audit: (runId, entry) =>
      deps.log('warn', 'hook request refused', {
        run: runId,
        code: entry.code,
        suppressed: entry.suppressed,
      }),
  });

  return { handler, drain };
}
