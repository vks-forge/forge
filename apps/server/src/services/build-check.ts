/**
 * The build check run before every Worker start.
 *
 * Why: a run's record must say which harness build ran it, and a build whose tool approvals
 *   Forge never loaded must not run at all. This is the one function the run preparation
 *   calls first: it asks the compatibility service for the installed build (refusing a
 *   changed one) and writes that build on the run row, so a surprising run can later be
 *   tied to the exact `claude` version that produced it.
 *
 * Exports: createBuildCheck().
 * Depends on: @forge/core (StorageAdapter), types/harness-compat. IO: one storage write per run.
 */

import type { StorageAdapter } from '@forge/core';
import type { HarnessCompat } from '#/types/harness-compat.types.js';

/** Returns `checkBuild(runId)`: throws `HarnessChangedError`, else stores the build as the run's `driver_version`. */
export function createBuildCheck(deps: {
  readonly compat: Pick<HarnessCompat, 'assertCurrent'>;
  readonly storage: StorageAdapter;
  readonly harnessId: string;
}): (runId: string) => Promise<void> {
  return async (runId) => {
    const version = await deps.compat.assertCurrent(deps.harnessId);
    if (version !== null) {
      await deps.storage.transaction((tx) =>
        tx.runs.update(runId, { driver_version: version }),
      );
    }
  };
}
