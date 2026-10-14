/**
 * Builds the gate list the verify phase runs: G1 over live evidence.
 *
 * Why: the Express lane is judged by G1 alone (G3 comes later). G1 must be given evidence
 *   the Worker cannot forge: the receipt chain and the run's HMAC secret (which exists only
 *   in this process's memory, d-0054), the git diff of the real worktree, and the list of
 *   tool calls the harness reported, read from the stored run events. A missing secret
 *   must never read as `passed`, so a restart cannot turn into a free merge.
 *
 * Exports: createGates().
 * Depends on: @forge/core (Gate), @forge/gates, types/server. No IO of its own.
 */

import type { Gate } from '@forge/core';
import { createG1Gate, createStorageToolCallLister } from '@forge/gates';
import type { GateDeps } from '#/types/server.types.js';

export function createGates(deps: GateDeps): Gate[] {
  return [
    createG1Gate({
      receipts: deps.receipts,
      worktrees: deps.worktrees,
      listToolCalls: createStorageToolCallLister(deps.storage),
      runSecret: (runId) => deps.registry.secret(runId),
      env: deps.env,
    }),
  ];
}
