/**
 * Run event schemas: the normalised event stream item and its small enums.
 *
 * Why: every harness speaks its own protocol, so the Director, storage and the control room
 *   read one vocabulary instead: assistant text, tool calls (with the input that may arrive
 *   in a later update), results, questions, permission decisions, usage, steering, and the
 *   brief the engine recorded at run start. Drivers translate into these at the boundary and
 *   untrusted harness output is parsed before anything acts on it (execution-plane.md §3).
 *
 * Exports: InteractionKind, PermissionDecision, RunEvent (and their types).
 * Depends on: schemas/errors, schemas/usage, schemas/run-inbox-events, zod. No IO.
 */

import { z } from 'zod';
import { ErrorFamily } from '#/schemas/errors.js';
import { InboxDeliveredEvent, UserMessageEvent } from '#/schemas/run-inbox-events.js';
import { SessionRef, UsageReport } from '#/schemas/usage.js';

const Timestamp = z.iso.datetime();

const eventBase = { seq: z.number().int().nonnegative(), ts: Timestamp };

/** Kinds of blocking interaction (director-core.md §3): `blocked` is a Worker's `report_blocked`; `failure` and `setup` are raised by Forge (schemas/escalation). */
export const InteractionKind = z.enum([
  'question',
  'plan_confirm',
  'permission',
  'blocked',
  'failure',
  'setup',
]);
export type InteractionKind = z.infer<typeof InteractionKind>;

/** The verdict a `permission` event records for one tool call (same words as `admit()`). */
export const PermissionDecision = z.enum(['allow', 'deny', 'ask']);
export type PermissionDecision = z.infer<typeof PermissionDecision>;

/** Normalized event stream item; discriminated on `type`. */
export const RunEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tool_call'),
    ...eventBase,
    call_id: z.string(),
    name: z.string(),
    input: z.unknown(),
  }),
  /**
   * The input of an already announced call, when it arrives later (ACP announces a call with
   * `{}` and sends the input in an update). Carries the same `call_id`; never a second call.
   */
  z.object({
    type: z.literal('tool_call_update'),
    ...eventBase,
    call_id: z.string(),
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
  /** The brief sent to the Worker at run start (redacted); the engine records it, drivers never emit it. */
  z.object({ type: z.literal('prompt'), ...eventBase, text: z.string() }),
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
  z.object({
    type: z.literal('permission'),
    ...eventBase,
    interaction_id: z.string().min(1).optional(),
    call_id: z.string().min(1),
    tool: z.string().min(1),
    decision: PermissionDecision,
  }),
  InboxDeliveredEvent,
  UserMessageEvent,
  z.object({ type: z.literal('session'), ...eventBase, session_ref: SessionRef }),
  z.object({
    type: z.literal('hook_liveness'),
    ...eventBase,
    fingerprint: z.string().min(1),
  }),
]);
export type RunEvent = z.infer<typeof RunEvent>;
