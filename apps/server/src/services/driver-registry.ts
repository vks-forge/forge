/**
 * Registry of the harness drivers this server can run, keyed by harness id.
 *
 * Why: projects name the harness their Workers use (`default_harness`), and a server only
 *   has the drivers installed on it. The engine asks this registry for the driver of a
 *   ticket's harness, keeps that driver with the run for steering and cancelling, and
 *   parks the ticket when the id is unknown instead of running it on a different harness.
 *   Registering two drivers under one id would let the second silently take over the
 *   first's runs, so it is refused at assembly time.
 *
 * Exports: createDriverRegistry().
 * Depends on: @forge/core (DriverRegistry, WorkerDriver, InvalidInputError). No IO.
 */

import { InvalidInputError } from '@forge/core';
import type { DriverRegistry, WorkerDriver } from '@forge/core';

/** A registry over `drivers`; throws `InvalidInputError` when two share an id. */
export function createDriverRegistry(drivers: readonly WorkerDriver[]): DriverRegistry {
  const byId = new Map<string, WorkerDriver>();
  for (const driver of drivers) {
    if (byId.has(driver.id)) {
      throw new InvalidInputError(`two drivers claim the harness id "${driver.id}"`);
    }

    byId.set(driver.id, driver);
  }

  return {
    get: (harnessId) => byId.get(harnessId) ?? null,
    ids: () => [...byId.keys()].sort(),
  };
}
