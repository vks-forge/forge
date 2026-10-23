/**
 * Request and reply shapes of the setup cache endpoints.
 *
 * Why: the clear action deletes files, so its body is strict: only a known flag is accepted and
 *   a typo can never widen what gets removed. The reply shapes are what the settings screen
 *   shows (sizes and bytes freed).
 *
 * Exports: SetupCacheClearBody, SetupCacheView, SetupCacheClearReply.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** `POST /settings/setup-cache/clear`: `include_downloads` also empties the shared package downloads. */
export const SetupCacheClearBody = z.strictObject({ include_downloads: z.boolean() });
export type SetupCacheClearBody = z.infer<typeof SetupCacheClearBody>;

/** `GET /settings/setup-cache`. */
export const SetupCacheView = z.object({
  setup_bytes: z.number().int().nonnegative(),
  downloads_bytes: z.number().int().nonnegative(),
});
export type SetupCacheView = z.infer<typeof SetupCacheView>;

/** The answer of the clear action. */
export const SetupCacheClearReply = z.object({
  freed_bytes: z.number().int().nonnegative(),
  cleared: z.array(z.enum(['setup', 'downloads'])),
});
export type SetupCacheClearReply = z.infer<typeof SetupCacheClearReply>;
