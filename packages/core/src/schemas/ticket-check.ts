/**
 * Ticket check output — the Director's judgement of a finished ticket against its plan.
 *
 * Why: before work reaches the owner's sign-off, someone must ask "did this do what the plan
 *   said?". That is the Director's job, done as a tool-less step over typed artifacts only (the
 *   plan entry's acceptance and files, the diff, the gate and test reports, the findings so far);
 *   the Worker's own account is never an input (d-0141 item 9), so it cannot talk the check into
 *   agreeing. The answer is held to this schema: per-criterion verdicts with evidence, findings
 *   with evidence, and a verdict. A `pass` that admits an unmet criterion or a critical or high
 *   finding contradicts itself and is refused as invalid output, so a self-contradicting model
 *   can never produce a pass the engine would act on.
 *
 * Exports: TicketCheckOutput, AcceptanceCheck (and their types), MAX_ACCEPTANCE_CHECKS.
 * Depends on: schemas/finding, zod. No IO.
 */

import { z } from 'zod';
import { Finding } from '#/schemas/finding.js';

export const MAX_ACCEPTANCE_CHECKS = 30;

/** One acceptance criterion of the plan entry and whether the diff meets it. */
export const AcceptanceCheck = z.object({
  criterion: z.string().min(1).max(500),
  met: z.enum(['yes', 'no', 'unclear']),
  evidence: z.string().min(1).max(1000),
});
export type AcceptanceCheck = z.infer<typeof AcceptanceCheck>;

/** `ticket_check` output: a verdict, the criteria checked, findings and the model's confidence. */
export const TicketCheckOutput = z
  .object({
    verdict: z.enum(['pass', 'changes', 'out_of_plan']),
    summary: z.string().min(1).max(2000),
    acceptance: z.array(AcceptanceCheck).max(MAX_ACCEPTANCE_CHECKS),
    findings: z.array(Finding).max(30),
    confidence: z.number().min(0).max(1),
  })
  .refine(
    (o) =>
      o.verdict !== 'pass' ||
      (!o.acceptance.some((a) => a.met === 'no') &&
        !o.findings.some((f) => f.severity === 'critical' || f.severity === 'high')),
    { message: 'a pass cannot list an unmet criterion or a critical or high finding' },
  );
export type TicketCheckOutput = z.infer<typeof TicketCheckOutput>;
