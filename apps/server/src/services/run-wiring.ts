/**
 * Wires what lets a Worker run start, outlive a restart and leave nothing behind.
 *
 * Why: a run needs three things from the app that belong together: the registry of its token
 *   and receipt secrets (kept in the SecretStore for the life of the run, d-0100), the
 *   preparation that registers them and tells the harness where the server is (run again on a
 *   resume, with the server's URL and port of the moment, d-0092), and the retirement that
 *   deletes the secrets once the run is over. Wiring them in one place keeps the composition
 *   root readable and makes sure preparation and retirement use the same registry.
 *
 * Exports: createRunWiring().
 * Depends on: @forge/core (InvalidInputError), @forge/drivers (PreparedRun type), @forge/hooks,
 *   services/prepare-run, services/secret-retirement, types/run-wiring. No IO of its own.
 */

import { InvalidInputError } from '@forge/core';
import type { RunRequest } from '@forge/core';
import type { PreparedRun } from '@forge/drivers';
import { createRunSecretRegistry } from '@forge/hooks';
import type { RunSecretRegistry } from '@forge/hooks';
import { createPrepareRun } from '#/services/prepare-run.js';
import { createSecretRetirement } from '#/services/secret-retirement.js';
import type { RunWiringDeps } from '#/types/run-wiring.types.js';

/** The registry, the run preparation port and the secret retirement for one server. */
export function createRunWiring(deps: RunWiringDeps): {
  readonly registry: RunSecretRegistry;
  readonly retirement: { sweep(): Promise<number> };
  readonly prepareRun: (req: RunRequest) => Promise<PreparedRun>;
} {
  const { layout, storage, receipts, secrets, now, log } = deps;
  const registry = createRunSecretRegistry({ store: secrets });

  return {
    registry,
    retirement: createSecretRetirement({ storage, registry, log }),
    prepareRun: createPrepareRun({
      runsDir: layout.data.runsDir,
      dbPath: layout.data.dbPath,
      mcpEntry: layout.mcpEntry,
      nodePath: process.execPath,
      registry,
      receipts,
      now,
      hookBaseUrl: () => {
        const address = deps.address();
        if (!address) {
          throw new InvalidInputError(
            'a run was prepared before the server was listening',
          );
        }

        return address.url;
      },
    }),
  };
}
