/**
 * Steer modes and driver capabilities — what a harness can be told and what it can do.
 *
 * Why: the Director routes by what a harness declares it can do, never by guessing from its
 *   name: whether it can resume a session (the restart resume of d-0092 needs it), which of
 *   `steer`, `follow_up` and `interrupt` it accepts mid-run, whether it reports cost, enforces
 *   a native sandbox or asks for permissions. A driver declares them up front, so a message or
 *   a resume is never sent to a harness that cannot take it.
 *
 * Exports: SteerMode, DriverCapabilities.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** How a message is delivered to a live run (director-core.md §8). */
export const SteerMode = z.enum(['steer', 'follow_up', 'interrupt']);
export type SteerMode = z.infer<typeof SteerMode>;

/** Capabilities a driver declares up front, so the Director routes by what a harness can actually do instead of guessing from its name. */
export const DriverCapabilities = z.object({
  resume: z.boolean(),
  steerModes: z.array(SteerMode),
  nativeSandbox: z.boolean(),
  reportsCost: z.boolean(),
  structuredOutput: z.boolean(),
  permissionRequests: z.boolean(),
});
export type DriverCapabilities = z.infer<typeof DriverCapabilities>;
