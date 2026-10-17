/**
 * The ports `composeData` builds: what every later wiring step must use instead of raw storage.
 *
 * Why: secrets, the debug trace, the live-query storage wrapper and the config source are built
 *   in one order (secrets first, then the trace that redacts with them, then the wrappers), and
 *   the assembly must take storage and config from here, never from the raw database, or a write
 *   could skip the project streams or the trace (d-0132, d-0163).
 *
 * Exports: DataPorts.
 * Depends on: @forge/core, types/project-events, types/trace. Types only.
 */

import type { ConfigSource, SecretStore, StorageAdapter } from '@forge/core';
import type { ProjectEvents } from '#/types/project-events.types.js';
import type { Trace } from '#/types/trace.types.js';

export interface DataPorts {
  readonly secrets: SecretStore;
  readonly trace: Trace;
  readonly projectEvents: ProjectEvents;
  readonly storage: StorageAdapter;
  readonly config: ConfigSource;
}
