/**
 * Binds the optional harness tester to the server's secret store for the route.
 *
 * Why: `POST /harnesses/:id/test` must always answer. A build without a harness tester
 *   (a fake-driver server, a future harness) reports "not available" as a normal test
 *   result instead of a 500, and when a tester exists it is handed the secret store the
 *   route itself cannot reach.
 *
 * Exports: harnessTestFor().
 * Depends on: @forge/core (SecretStore type), types/routes, types/server. No IO of its own.
 */

import type { SecretStore } from '@forge/core';
import type { RouteDeps } from '#/types/routes.types.js';
import type { HarnessTester } from '#/types/server.types.js';

export function harnessTestFor(
  tester: HarnessTester | undefined,
  secrets: SecretStore,
): RouteDeps['harnessTest'] {
  return (setup, live) =>
    tester
      ? tester(setup, live, secrets)
      : Promise.resolve({
          auth_mode: setup.authMode,
          ok: false,
          live: 'skipped',
          error: 'harness testing is not available in this build',
        });
}
