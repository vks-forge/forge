/**
 * What the run wiring is built from.
 *
 * Why: preparing a run, registering its secrets and retiring them touch the data home layout,
 *   the database, the receipt log, the SecretStore, the clock and the address the server is
 *   listening on (known only after the port is bound). Naming them as one bag keeps
 *   `createRunWiring` small and lets a test build it over fakes.
 *
 * Exports: RunWiringDeps.
 * Depends on: @forge/core (SecretStore, StorageAdapter), @forge/engine (Logger), @forge/tools
 *   (ReceiptLog), types/settings, types/server. Types only.
 */

import type { SecretStore, StorageAdapter } from '@forge/core';
import type { Logger } from '@forge/engine';
import type { ReceiptLog } from '@forge/tools';
import type { ServerAddress } from '#/types/server.types.js';
import type { ServerSettings } from '#/types/settings.types.js';

export interface RunWiringDeps {
  readonly layout: ServerSettings['layout'];
  readonly storage: StorageAdapter;
  readonly receipts: ReceiptLog;
  readonly secrets: SecretStore;
  readonly now: () => number;
  readonly log: Logger;
  /** Where the server listens, or null before it is bound; read per run because the port may be dynamic. */
  readonly address: () => ServerAddress | null;
  /** Refuses a run start when the installed harness build is not the loaded one; see `PrepareRunOptions.checkBuild`. */
  readonly checkBuild?: (runId: string) => Promise<void>;
}
