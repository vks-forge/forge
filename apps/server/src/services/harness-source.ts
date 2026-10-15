/**
 * Reads the owner's harness settings from the database for each run.
 *
 * Why: which `claude` runs a Worker and how it signs in are edited in Settings while the
 *   server is up (d-0087). Reading the row at the start of every run, instead of capturing
 *   it at boot, makes an edit apply to the next run with no restart. A harness that was
 *   never registered runs on the defaults: `claude` found on PATH, its own login. A harness
 *   whose installed build failed the compatibility check is `paused` (d-0088); the setup
 *   carries the plain-language reason so the driver refuses to start a run on it.
 *
 * Exports: createHarnessSource(), readHarnessSetup(), DEFAULT_HARNESS.
 * Depends on: @forge/core (StorageAdapter), @forge/drivers (types). IO: one storage read.
 */

import type { StorageAdapter } from '@forge/core';
import type { HarnessSetup, HarnessSource } from '@forge/drivers';

/** Id of the harness Workers and the Director use until the registry says otherwise. */
export const DEFAULT_HARNESS = 'claude';

/** The setup of harness `id` as registered, or the defaults when it never was. */
export async function readHarnessSetup(
  storage: StorageAdapter,
  id: string,
): Promise<HarnessSetup> {
  const row = await storage.transaction((tx) => tx.harnesses.get(id));
  if (!row) {
    return { id, authMode: 'login' };
  }

  return {
    id: row.id,
    binaryPath: row.binary_path,
    authMode: row.auth_mode,
    ...(row.status === 'paused'
      ? {
          pausedReason:
            row.status_note ?? 'its installed build failed the compatibility check',
        }
      : {}),
  };
}

export function createHarnessSource(storage: StorageAdapter): HarnessSource {
  return () => readHarnessSetup(storage, DEFAULT_HARNESS);
}
