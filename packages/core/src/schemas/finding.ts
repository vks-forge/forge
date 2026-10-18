/**
 * Finding schema — one thing a check found, with the evidence for it.
 *
 * Why: a reviewer, a critic and the Director's check against the plan all report the same way:
 *   a severity, a place and evidence. A finding without evidence is an opinion, and an opinion
 *   must not be able to send work back or hold a merge, so the schema refuses it. The shape lives
 *   on its own because three schemas share it (the reviewer's submission, the Director check's
 *   output, the decision escalation) and none may import another's file without a cycle.
 *
 * Exports: Finding (and its type).
 * Depends on: schemas/pipeline, zod. No IO.
 */

import { z } from 'zod';
import { Severity } from '#/schemas/pipeline.js';

const RelPath = z.string().min(1).max(500);

/** One thing a check found; evidence is required, a finding without it is refused. */
export const Finding = z.object({
  severity: Severity,
  file: RelPath.optional(),
  line: z.number().int().positive().optional(),
  issue: z.string().min(1).max(1000),
  evidence: z.string().min(1).max(2000),
});
export type Finding = z.infer<typeof Finding>;
