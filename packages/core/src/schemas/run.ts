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
 *   RunEvent, RunStatus, Run, SteerMode, DriverCapabilities, Sha256Hex, ErrorFamily (re-export).
 * Depends on: schemas/ticket, schemas/errors, zod. No IO.
 */

import { z } from 'zod';
import { ErrorFamily } from '#/schemas/errors.js';
import { Lane } from './ticket.js';

export { ErrorFamily };

/** Lowercase hex SHA-256 digest; the only form in which a run token is ever stored. */
export const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);
export type Sha256Hex = z.infer<typeof Sha256Hex>;

const Timestamp = z.iso.datetime();

/** Token counts for one model. */
export const Usage = z.object({
  in: z.number().nonnegative(),
  out: z.number().nonnegative(),
  cachedIn: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
});
export type Usage = z.infer<typeof Usage>;

/** Total usage with an optional per-model breakdown. */
export const UsageReport = Usage.extend({
  byModel: z.record(z.string(), Usage).optional(),
});
export type UsageReport = z.infer<typeof UsageReport>;

/** Opaque harness session id used to resume a run. */
export const SessionRef = z.string().min(1);
export type SessionRef = z.infer<typeof SessionRef>;

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

/** Everything a driver needs to start a run. No AbortSignal (not serializable); cancel through `WorkerDriver.cancel`. */
export const RunRequest = z.object({
  ticketId: z.string().min(1),
  cwd: z.string().min(1),
  prompt: z.string(),
  model: z.string().min(1),
  permissionPolicy: PermissionPolicy,
  tools: ToolExposure,
  budget: RunBudget,
  resume: SessionRef.optional(),
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
]);
export type RunResultStatus = z.infer<typeof RunResultStatus>;

/** Normalized final result of a run, including the error family for failures. */
export const RunResult = z.object({
  status: RunResultStatus,
  session: SessionRef.nullable(),
  usage: UsageReport,
  costUsd: z.number().nonnegative().nullable(),
  filesTouched: z.array(z.string()),
  structured: z.unknown().optional(),
  errorFamily: ErrorFamily.optional(),
  retryNotBefore: Timestamp.optional(),
});
export type RunResult = z.infer<typeof RunResult>;

const eventBase = { seq: z.number().int().nonnegative(), ts: Timestamp };

/** Kinds of blocking interaction (director-core.md §3). */
export const InteractionKind = z.enum(['question', 'plan_confirm', 'permission']);
export type InteractionKind = z.infer<typeof InteractionKind>;

/** Normalized event stream item; discriminated on `type`. */
export const RunEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tool_call'),
    ...eventBase,
    call_id: z.string(),
    name: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal('tool_result'),
    ...eventBase,
    call_id: z.string(),
    output: z.unknown(),
    is_error: z.boolean(),
  }),
  z.object({ type: z.literal('text'), ...eventBase, text: z.string() }),
  z.object({
    type: z.literal('ask'),
    ...eventBase,
    interaction_id: z.string(),
    kind: InteractionKind,
    prompt: z.string(),
  }),
  z.object({
    type: z.literal('finish'),
    ...eventBase,
    summary: z.string(),
    structured: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('error'),
    ...eventBase,
    family: ErrorFamily,
    message: z.string(),
  }),
  z.object({ type: z.literal('usage'), ...eventBase, usage: UsageReport }),
]);
export type RunEvent = z.infer<typeof RunEvent>;

/** Persisted run status: `running` or a terminal result. */
export const RunStatus = z.enum([
  'running',
  'success',
  'refused',
  'max_turns',
  'timeout',
  'error',
  'cancelled',
]);
export type RunStatus = z.infer<typeof RunStatus>;

/** The persisted `runs` row (snake_case). */
export const Run = z.object({
  id: z.string().min(1),
  ticket_id: z.string().min(1),
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
  retry_of: z.string().optional(),
});
export type Run = z.infer<typeof Run>;

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
