/**
 * Gate result schema — one independent gate's verdict on a run.
 *
 * Why: a ticket may only move to Review or merge on evidence produced by processes the
 *   Worker does not control (the G1-G6 gates and the browser check). Each verdict is a
 *   row naming the run it judged, the gate, the outcome and where its report lives, so
 *   the Ticket screen and the merge decision read the same record. Closed gate and status
 *   sets mean a row for a gate that does not exist, or an outcome nobody defined, is
 *   rejected instead of being read as a pass (verification-plane.md §1-§2).
 *
 * Exports: GateName, GateStatus, GateResult, NewGateResult.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** G1..G6 plus the browser check `BR` (director-core.md §3 `gate_results.gate`). */
export const GateName = z.enum(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'BR']);
export type GateName = z.infer<typeof GateName>;

/** `skipped` carries its reason in `report_ref` (TS-only checks under a generic profile). */
export const GateStatus = z.enum(['passed', 'failed', 'skipped', 'error']);
export type GateStatus = z.infer<typeof GateStatus>;

const Timestamp = z.iso.datetime();

/** The `gate_results` row. */
export const GateResult = z.object({
  id: z.number().int().positive(),
  run_id: z.string().min(1),
  gate: GateName,
  status: GateStatus,
  report_ref: z.string().min(1).optional(),
  /** The commit the gates judged; the merge must still find the PR at this sha. Absent on rows from before it was recorded. */
  head_sha: z.string().min(1).optional(),
  started_at: Timestamp,
  ended_at: Timestamp.optional(),
});
export type GateResult = z.infer<typeof GateResult>;

/** A verdict as a gate submits it; storage assigns the id. */
export const NewGateResult = GateResult.omit({ id: true });
export type NewGateResult = z.infer<typeof NewGateResult>;
