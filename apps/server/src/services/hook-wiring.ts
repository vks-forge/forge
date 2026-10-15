/**
 * Builds the hook ingress the harness calls on every tool event.
 *
 * Why: the hook route is the one policy door for Worker tool calls (`admit()`, signed
 *   receipts, liveness). Wiring its dependencies (run secrets, the effective catalogue,
 *   the liveness recorder that wakes the tick, the audit line for refused requests) is
 *   a self-contained step, kept apart so the composition root stays readable.
 *
 * Exports: createHooks().
 * Depends on: @forge/core, @forge/engine (Logger), @forge/hooks, @forge/tools (admit),
 *   services/tool-policy. No IO of its own.
 */

import type { StorageAdapter } from '@forge/core';
import type { Logger } from '@forge/engine';
import { createHookHandler, createLivenessRecorder } from '@forge/hooks';
import type { RunSecretRegistry } from '@forge/hooks';
import { admit } from '@forge/tools';
import type { ReceiptLog } from '@forge/tools';
import type { ToolPolicy } from '#/types/server.types.js';

export function createHooks(deps: {
  readonly storage: StorageAdapter;
  readonly receipts: ReceiptLog;
  readonly registry: RunSecretRegistry;
  readonly policy: ToolPolicy;
  readonly now: () => number;
  readonly requestTick: () => void;
  readonly log: Logger;
}): ReturnType<typeof createHookHandler> {
  const { storage, now } = deps;

  return createHookHandler({
    db: storage,
    receipts: deps.receipts,
    admit,
    credentials: deps.registry.credentials,
    admitContext: deps.policy.admitContext,
    clock: () => new Date(now()),
    requireLiveness: true,
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
}
