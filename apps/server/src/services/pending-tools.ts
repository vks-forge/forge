/**
 * Refuses a Worker start on a build whose tools nobody has decided yet.
 *
 * Why: policy denies a tool whose shape is `pending`, so a Worker started on such a build is
 *   denied on every call, the run is wasted and the Worker ends up telling the owner to "fix
 *   the hook". The owner never writes code and must see a plain setup item instead. This is
 *   the check run before a start: it throws `HarnessToolsPendingError`, which the engine
 *   parks as a setup problem that resumes once the tools are decided. It fails closed: a
 *   loaded build with no version row, or whose check has not finished, counts as not ready.
 *   A build whose check failed is left to the harness pause, which refuses the start itself.
 *
 * Exports: assertToolsDecided().
 * Depends on: @forge/core (HarnessToolsPendingError, StorageAdapter). IO: reads storage.
 */

import { HarnessToolsPendingError } from '@forge/core';
import type { StorageAdapter } from '@forge/core';

/** Throws `HarnessToolsPendingError` when `version` is not ready to run Workers; null means no build is known. */
export async function assertToolsDecided(
  storage: StorageAdapter,
  kind: string,
  version: string | null,
): Promise<void> {
  if (version === null) {
    return;
  }

  const { row, tools } = await storage.transaction(async (tx) => ({
    row: await tx.harnessVersions.get(kind, version),
    tools: await tx.harnessToolSchemas.list(kind, version),
  }));

  if (row?.compat === 'fail') {
    return;
  }

  const pending = tools.filter((t) => t.status === 'pending').map((t) => t.tool);
  if (row?.compat !== 'pass' || pending.length > 0) {
    throw new HarnessToolsPendingError(version, pending);
  }
}
