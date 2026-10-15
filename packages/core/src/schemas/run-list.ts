/**
 * Run list schemas — the Runs screen row, its query and one page, and the run detail.
 *
 * Why: the Runs screen answers "what are my Workers doing and what did they cost?" for many
 *   runs at once. A row carries what that table shows (which ticket, which harness, status,
 *   how long, what generation, cost and tokens when recorded) so the screen does not fetch
 *   each run. `paused_harness` marks a run whose harness is parked until its quota resets,
 *   the "quota-parked" state that the persisted status alone cannot tell. A ticket that is
 *   waiting for a free slot has no run row yet, so "queued" work is read from the ticket
 *   list, not here. The detail adds what a person debugging one run needs: the working
 *   directory, the harness session and the gate verdicts the run produced.
 *
 * Exports: RunSummary, RunListQuery, RunListPage, RunDetail, RUN_LIST_DEFAULT_LIMIT,
 *   RUN_LIST_MAX_LIMIT.
 * Depends on: schemas/cost-report, schemas/gate-result, schemas/errors, schemas/run, zod. No IO.
 */

import { z } from 'zod';
import { TokenTotals } from '#/schemas/cost-report.js';
import { ErrorFamily } from '#/schemas/errors.js';
import { GateResult } from '#/schemas/gate-result.js';
import { Lane } from '#/schemas/ticket.js';
import { RunStatus } from '#/schemas/run.js';

export const RUN_LIST_DEFAULT_LIMIT = 50;
export const RUN_LIST_MAX_LIMIT = 200;

/** One row of the Runs table. `project` is the project slug. */
export const RunSummary = z.object({
  id: z.string().min(1),
  ticket_id: z.string().min(1),
  ticket_title: z.string().optional(),
  project: z.string().min(1).optional(),
  harness: z.string().min(1),
  lane: Lane,
  status: RunStatus,
  started_at: z.iso.datetime(),
  ended_at: z.iso.datetime().optional(),
  /** End minus start, or now minus start while the run is live; null when the run is neither ended nor live (interrupted). */
  duration_ms: z.number().int().nonnegative().nullable(),
  generation: z.number().int().positive(),
  retry_of: z.string().min(1).optional(),
  error_family: ErrorFamily.optional(),
  /** True while the run is not over and its harness is parked until a quota reset. */
  paused_harness: z.boolean(),
  /** Absent when the harness reported no cost. */
  cost_usd: z.number().nonnegative().optional(),
  /** Absent when the harness reported no usage. */
  tokens: TokenTotals.optional(),
});
export type RunSummary = z.infer<typeof RunSummary>;

/** `GET /projects/:slug/runs` and `GET /runs` parameters; `status` is repeatable or comma separated. */
export const RunListQuery = z.object({
  status: z.array(RunStatus).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(RUN_LIST_MAX_LIMIT)
    .default(RUN_LIST_DEFAULT_LIMIT),
  cursor: z.string().min(1).optional(),
});
export type RunListQuery = z.infer<typeof RunListQuery>;

export const RunListPage = z.object({
  items: z.array(RunSummary),
  nextCursor: z.string().min(1).nullable(),
});
export type RunListPage = z.infer<typeof RunListPage>;

/** `GET /runs/:id`. */
export const RunDetail = RunSummary.extend({
  cwd: z.string().min(1),
  driver_version: z.string().min(1),
  owner: z.string().min(1),
  session_ref: z.string().min(1).optional(),
  last_event_at: z.iso.datetime().optional(),
  interrupted_at: z.iso.datetime().optional(),
  config_version: z.string().min(1).optional(),
  /** Tokens per model, as the harness reported them. */
  tokens_by_model: z.record(z.string(), TokenTotals).optional(),
  gates: z.array(GateResult),
});
export type RunDetail = z.infer<typeof RunDetail>;
