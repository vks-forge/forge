/**
 * What the harness guard is built from.
 *
 * Why: the guard joins build compatibility, the pre-start build check and the tool policy,
 *   each needing a different slice of the app's ports; one named shape keeps the assembly's
 *   call readable.
 *
 * Exports: HarnessGuardDeps.
 * Depends on: @forge/core, @forge/engine (Logger), @forge/tools (CatalogueStore),
 *   types/harness-compat. Types only.
 */

import type { ConfigSource, StorageAdapter } from '@forge/core';
import type { Logger } from '@forge/engine';
import type { CatalogueStore } from '@forge/tools';
import type { CompatPort } from '#/types/harness-compat.types.js';

export interface HarnessGuardDeps {
  readonly storage: StorageAdapter;
  readonly catalogue: CatalogueStore;
  readonly config: ConfigSource;
  readonly port: CompatPort | undefined;
  /** The driver id catalogue entries list their support under. */
  readonly supportKey: string;
  readonly dataHome: string;
  readonly now: () => number;
  readonly log: Logger;
}
