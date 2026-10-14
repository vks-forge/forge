/**
 * Route dependencies for the harness API, for tests of routes that do not care about it.
 *
 * Why: `buildRoutes` takes one dependency bag and the harness routes need a SecretStore and a
 *   tester. Tests of other routes only need the bag to type-check; this gives them an in-memory
 *   store and a tester that never starts a process, so no test can spend money or touch the
 *   machine's real `claude` by accident.
 *
 * Exports: stubHarnessDeps().
 * Depends on: @forge/secrets (memory store), src/types/routes. No IO.
 */

import { createMemorySecretStore } from '@forge/secrets';
import type { RouteDeps } from '#/types/routes.types.js';

export function stubHarnessDeps(): Pick<RouteDeps, 'secrets' | 'harnessTest'> {
  return {
    secrets: createMemorySecretStore(),
    harnessTest: async (setup) => ({
      auth_mode: setup.authMode,
      ok: true,
      live: 'skipped',
    }),
  };
}
