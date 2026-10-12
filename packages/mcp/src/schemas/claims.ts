/**
 * Claim schema — what a Worker may assert in `finish`.
 *
 * Why: Workers overstate what they did ("ran the tests", "read every file"). The G1
 *   gate checks each claim against the tool receipts, which only works if claims come in
 *   a closed, typed vocabulary instead of free prose. Strict objects and a closed kind
 *   list mean an invented claim kind is rejected at the door rather than silently
 *   skipped by the matcher (verification-plane.md §2).
 *
 * Exports: Claim.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

const RelPath = z
  .string()
  .min(1)
  .max(500)
  .refine((p) => !p.includes('\0'), 'path must not contain NUL');

export const Claim = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ran_tests') }),
  z.strictObject({ kind: z.literal('edited'), path: RelPath }),
  z.strictObject({ kind: z.literal('added_test'), name: z.string().min(1).max(300) }),
  z.strictObject({ kind: z.literal('read'), path: RelPath }),
]);
export type Claim = z.infer<typeof Claim>;
