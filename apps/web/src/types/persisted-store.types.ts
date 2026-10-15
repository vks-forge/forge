/**
 * Options of `createPersistedStore()`.
 *
 * Why: every persisted UI store needs the same four things (a name that becomes the storage
 *   key, a schema version, a way to upgrade old saved data, and a check that what was read
 *   back is the shape the app expects). Naming them once keeps each store file down to its data.
 *
 * Exports: PersistedStoreOptions.
 * Depends on: zod (type only). Types only.
 */

import type { z } from 'zod';

export interface PersistedStoreOptions<T extends object> {
  /** Short name; the storage key is `forge.ui.<name>`. */
  readonly name: string;
  /** Bump when the saved shape changes; `migrate` then upgrades older saves. */
  readonly version: number;
  /** The defaults; also the only keys that are ever written to storage. */
  readonly initial: T;
  /** What a saved value must look like; anything else is dropped for the defaults. */
  readonly schema: z.ZodType<T>;
  /** Upgrades data saved by an older `version`; default: forget it and start from `initial`. */
  readonly migrate?: (saved: unknown, savedVersion: number) => unknown;
}
