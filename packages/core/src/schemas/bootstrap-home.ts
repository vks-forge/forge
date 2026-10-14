/**
 * Bootstrap file schema — `forge-home.json` in the platform config directory.
 *
 * Why: the data home is per-user and defaults to a fixed place, but the user may pick another
 *   disk on first run. That choice cannot live in the database (the database is inside the
 *   home), so one tiny file in the platform config directory records it. Parsing it strictly
 *   means a hand-edited or truncated file stops startup with a clear message instead of
 *   silently creating a second, empty home.
 *
 * Exports: BootstrapHomeFile.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

export const BootstrapHomeFile = z.strictObject({
  /** Absolute folder chosen as the data home. */
  dataHome: z.string().min(1),
});
export type BootstrapHomeFile = z.infer<typeof BootstrapHomeFile>;
