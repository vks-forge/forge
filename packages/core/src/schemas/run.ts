/**
 * Run schemas — normalized driver-boundary shapes and the persisted Run row.
 *
 * Why: Workers run in third-party harnesses whose protocols, event formats, cost
 *   reporting and failure modes all differ. These schemas are the normalized vocabulary
 *   the Director and storage speak instead: what a run is asked to do (RunRequest with
 *   its permission policy, tool exposure and budget), what it emits (RunEvent), how it
 *   ended (RunResult with an error family) and what a driver can do (DriverCapabilities,
 *   declared, never guessed). Drivers translate into them at the boundary, so adding a
 *   harness never changes the Director and untrusted harness output is parsed before
 *   anything acts on it. Boundary shapes are camelCase; persisted `runs` rows are
 *   snake_case like other tables (execution-plane.md §3, §6, §8).
 *
 * Exports: Usage, UsageReport, SessionRef, Isolation, PermissionPolicy, ToolExposure,
 *   RunBudget, RunRequest, RunHandle, RunResultStatus, RunResult, InteractionKind,
 *   PermissionDecision, RunEvent, RunStatus, Run, Sha256Hex, ErrorFamily, SteerMode and
 *   DriverCapabilities (re-exports from steer-mode).
 * Depends on: schemas/ticket, schemas/errors, schemas/steer-mode, schemas/usage, schemas/run-event, schemas/config-override, zod. No IO.
 */

import { z } from 'zod';
import { ConfigVersionRef } from '#/schemas/config-override.js';
import { ErrorFamily } from '#/schemas/errors.js';
import { SessionRef, UsageReport } from '#/schemas/usage.js';
import { Lane } from './ticket.js';

export { ErrorFamily };
export { SessionRef, Usage, UsageReport } from '#/schemas/usage.js';
export { InteractionKind, PermissionDecision, RunEvent } from '#/schemas/run-event.js';
export { DriverCapabilities, SteerMode } from '#/schemas/steer-mode.js';

/** Lowercase hex SHA-256 digest; the only form in which a run token is ever stored. */
export const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);
export type Sha256Hex = z.infer<typeof Sha256Hex>;

const Timestamp = z.iso.datetime();

/** Where a run executes (execution-plane.md §6). */
export const Isolation = z.enum(['host', 'wsl2', 'harness-sandbox', 'container']);
export type Isolation = z.infer<typeof Isolation>;

/** Allow/deny lists and the fallback for unlisted tools (execution-plane.md §6). */
export const PermissionPolicy = z.object({
  allow: z.array(z.string()),
  deny: z.array(z.string()),
  onUnlisted: z.enum(['ask', 'deny']),
});
export type PermissionPolicy = z.infer<typeof PermissionPolicy>;

/** Which MCP servers and tools a run may see. */
export const ToolExposure = z.object({
  mcpServers: z.array(z.string()),
  allow: z.array(z.string()),
  deny: z.array(z.string()),
});
export type ToolExposure = z.infer<typeof ToolExposure>;

/** Hard limits for a run: turns, spend, stall and per-turn time. */
export const RunBudget = z.object({
  maxTurns: z.number().int().positive(),
  maxUsd: z.number().positive(),
  stallMs: z.number().int().positive(),
  turnMs: z.number().int().positive(),
});
export type RunBudget = z.infer<typeof RunBudget>;

/**
 * Everything a driver needs to start a run. No AbortSignal (not serializable); cancel
 * through `WorkerDriver.cancel`.
 *
 * `runId`, `projectId`, `lane`, `promptHash` and `mcpIdentity` let the driver label its
 * events and receipts without asking the app; `mcpIdentity` is the server name the run's
 * Forge MCP server is registered under (its tools are `mcp__<identity>__<tool>`).
 * `permissionPolicy` and `tools` are optional on purpose: the app derives both from
 * `visibleTools()` over the run's `AdmitContext`, so a request must not carry a second,
 * possibly different, policy source. A driver that is handed them treats them as that
 * derivation, never as an override.
 */
export const RunRequest = z.object({
  runId: z.string().min(1),
  projectId: z.string().min(1),
  lane: Lane,
  promptHash: Sha256Hex,
  mcpIdentity: z.string().min(1),
  ticketId: z.string().min(1),
  cwd: z.string().min(1),
  prompt: z.string(),
  model: z.string().min(1),
  permissionPolicy: PermissionPolicy.optional(),
  tools: ToolExposure.optional(),
  budget: RunBudget,
  resume: SessionRef.optional(),
  /** Run secret generation (1 for a first start, +1 on each resume); the app registers that generation's secret. */
  generation: z.number().int().positive().optional(),
  env: z.record(z.string(), z.string()),
  isolation: Isolation,
});
export type RunRequest = z.infer<typeof RunRequest>;

/** Opaque reference to a started run. */
export const RunHandle = z.object({
  runId: z.string().min(1),
  session: SessionRef.optional(),
});
export type RunHandle = z.infer<typeof RunHandle>;

/** Terminal outcome of a run as reported by the driver. */
export const RunResultStatus = z.enum([
  'success',
  'refused',
  'max_turns',
  'timeout',
  'error',
  'cancelled',
  'paused',
]);
export type RunResultStatus = z.infer<typeof RunResultStatus>;

/**
 * Normalized final result of a run, including the error family for failures. `paused`
 * means the run stopped on purpose to wait for a human: it names `pauseReason` and the
 * `interactionId` to answer, and the Director resumes it as a new run (execution-plane.md §7).
 */
export const RunResult = z
  .object({
    status: RunResultStatus,
    session: SessionRef.nullable(),
    usage: UsageReport,
    costUsd: z.number().nonnegative().nullable(),
    filesTouched: z.array(z.string()),
    structured: z.unknown().optional(),
    errorFamily: ErrorFamily.optional(),
    retryNotBefore: Timestamp.optional(),
    pauseReason: z.literal('interaction').optional(),
    interactionId: z.string().min(1).optional(),
  })
  .refine(
    (r) =>
      r.status === 'paused'
        ? r.pauseReason !== undefined && r.interactionId !== undefined
        : r.pauseReason === undefined && r.interactionId === undefined,
    { message: 'pauseReason and interactionId belong to status paused, and only to it' },
  );
export type RunResult = z.infer<typeof RunResult>;

/**
 * Persisted run status. `starting` (row created, harness not yet confirmed) and
 * `running` are the active states; `settling` and `settled` are the reconcile
 * hand-off after the harness stopped; the rest are terminal results. `interrupted`
 * is a run the server stopped under (shutdown) or lost (crash) that still has a
 * harness session: it is neither active nor ended and is resumed on the next start
 * (d-0092, `domain/run-lifecycle`).
 */
export const RunStatus = z.enum([
  'starting',
  'running',
  'settling',
  'settled',
  'success',
  'refused',
  'max_turns',
  'timeout',
  'error',
  'cancelled',
  'interrupted',
]);
export type RunStatus = z.infer<typeof RunStatus>;

/**
 * The persisted `runs` row (snake_case). `owner` is the Forge server instance that
 * started the run (a restart finds every other owner's live run and resumes or crash-settles it, d-0092).
 * A run that was interrupted by a restart is resumed on the same row: `generation`
 * counts the run secret generations (1 until the first resume), `resumable_session` is
 * the harness session the resume loads, `interrupted_at` is when it was stopped. A retry
 * after a failure is a new row whose `retry_of` names the run it continues; a row with
 * `ended_at` is never reopened.
 */
export const Run = z.object({
  id: z.string().min(1),
  ticket_id: z.string().min(1),
  project: z.string().min(1).optional(),
  harness: z.string().min(1),
  driver_version: z.string().min(1),
  session_ref: SessionRef.optional(),
  cwd: z.string().min(1),
  lane: Lane,
  started_at: Timestamp,
  ended_at: Timestamp.optional(),
  status: RunStatus,
  usage: UsageReport.optional(),
  cost_usd: z.number().nonnegative().optional(),
  error_family: ErrorFamily.optional(),
  retry_of: z.string().min(1).optional(),
  owner: z.string().min(1),
  pid: z.number().int().positive().optional(),
  last_event_at: Timestamp.optional(),
  final_chain_hash: Sha256Hex.optional(),
  catalogue_hash: Sha256Hex.optional(),
  prompt_hash: Sha256Hex.optional(),
  /** Settings versions the run started under, `c<company>:p<project>` (d-0085); 0 means built-in defaults. */
  config_version: ConfigVersionRef.optional(),
  hook_registered_at: Timestamp.optional(),
  /** Run secret generation; absent reads as 1. A resume after a restart adds 1 (d-0100). */
  generation: z.number().int().positive().optional(),
  resumable_session: SessionRef.optional(),
  interrupted_at: Timestamp.optional(),
});
export type Run = z.infer<typeof Run>;
