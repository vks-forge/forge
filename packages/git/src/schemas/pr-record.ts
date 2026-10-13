/**
 * PR record schema — the JSON file that stands in for a pull request on a bare repo.
 *
 * Why: a bare git repo has no pull requests. The local host keeps one JSON file per PR
 *   next to the repository so the engine's open, verify, merge and close flow can run
 *   offline exactly as it does against GitHub. The file is parsed on every read so a
 *   hand-edited or corrupt record fails loudly instead of being read as an open PR.
 *
 * Exports: PrRecord.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

export const PrRecord = z.object({
  number: z.number().int().positive(),
  branch: z.string().min(1),
  base: z.string().min(1),
  title: z.string(),
  body: z.string(),
  state: z.enum(['open', 'closed', 'merged']),
  created_at: z.iso.datetime(),
  merged_sha: z.string().optional(),
  merged_head_sha: z.string().optional(),
});
export type PrRecord = z.infer<typeof PrRecord>;
