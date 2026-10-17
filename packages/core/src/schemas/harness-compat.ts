/**
 * Harness compatibility schemas — the per-build check result and the tool schemas it finds.
 *
 * Why: Forge does not pin a harness version (d-0088). The first time it sees an installed
 *   build it checks, on this machine, that the things the safety model relies on still hold
 *   (hooks register before the first tool call, ACP announces a tool call before its input
 *   is handled, permission requests arrive, receipts can be cross-checked in time) and
 *   captures the input schema of every built-in tool the build offers. A failed check pauses
 *   the harness; a tool whose schema is new or changed waits for the owner's approval, and
 *   until then policy denies it. These are the rows and the report behind that: one row per
 *   harness build, one row per tool per build, and the typed report the owner reads in
 *   Settings when something needs a decision. `kind` is the driver family, the only harness
 *   name in core data.
 *
 * Exports: CompatCheckId, CompatCheckStatus, CompatCheck, CompatToolShape, CompatReport,
 *   CompatStatus, HarnessVersion, ToolSchemaStatus, HarnessToolSchema.
 * Depends on: schemas/agent, schemas/harness, zod. No IO.
 */

import { z } from 'zod';
import { HarnessModel } from '#/schemas/agent.js';
import { HarnessKind } from '#/schemas/harness.js';

/** The facts the check proves about a build; the first four are the d-0088 probe set. */
export const CompatCheckId = z.enum([
  'hooks_before_first_tool',
  'acp_event_order',
  'permission_requests',
  'receipt_timing',
  'tool_schemas',
  'runs_installed_build',
]);
export type CompatCheckId = z.infer<typeof CompatCheckId>;

/** `skipped` is a check that does not apply to this engine (reason in `detail`); it is neither a pass nor a failure. */
export const CompatCheckStatus = z.enum(['pass', 'fail', 'skipped']);
export type CompatCheckStatus = z.infer<typeof CompatCheckStatus>;

export const CompatCheck = z.object({
  id: CompatCheckId,
  status: CompatCheckStatus,
  /** What was seen, in plain words; shown to the owner. */
  detail: z.string(),
});
export type CompatCheck = z.infer<typeof CompatCheck>;

/** One built-in tool the build offers, as the model API receives it. */
export const CompatToolShape = z.object({
  /** Catalogue id (`read`, `shell`, ...). */
  tool: z.string().min(1),
  /** The harness's own tool names that map to it (`Bash`, `PowerShell`). */
  native: z.array(z.string().min(1)).min(1),
  /** `sha256:` over the canonical name and input schema of each of those tools. */
  schema_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});
export type CompatToolShape = z.infer<typeof CompatToolShape>;

export const CompatReport = z.object({
  kind: HarnessKind,
  version: z.string().min(1),
  started_at: z.iso.datetime(),
  finished_at: z.iso.datetime(),
  /** True when no check failed. */
  passed: z.boolean(),
  /** One plain sentence: what happened and what the owner can do. */
  summary: z.string().min(1),
  checks: z.array(CompatCheck),
  tools: z.array(CompatToolShape),
  /** The models the driver declared for this build (agent pickers read them); absent on older reports. */
  models: z.array(HarnessModel).optional(),
});
export type CompatReport = z.infer<typeof CompatReport>;

/** `pending` until a check ran for the build. */
export const CompatStatus = z.enum(['pass', 'fail', 'pending']);
export type CompatStatus = z.infer<typeof CompatStatus>;

/** The `harness_versions` row: what Forge knows about one build of one harness. */
export const HarnessVersion = z.object({
  kind: HarnessKind,
  version: z.string().min(1),
  compat: CompatStatus,
  report: CompatReport.optional(),
  checked_at: z.iso.datetime().optional(),
});
export type HarnessVersion = z.infer<typeof HarnessVersion>;

export const ToolSchemaStatus = z.enum(['approved', 'pending', 'denied']);
export type ToolSchemaStatus = z.infer<typeof ToolSchemaStatus>;

/** The `harness_tool_schemas` row: one tool's schema hash for one build, and the decision on it. */
export const HarnessToolSchema = z.object({
  harness_kind: HarnessKind,
  version: z.string().min(1),
  tool: z.string().min(1),
  schema_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  status: ToolSchemaStatus,
  /** Who approved or denied: the owner's name, or `forge-release` for the shipped list. */
  decided_by: z.string().min(1).optional(),
  decided_at: z.iso.datetime().optional(),
  /** Why the owner decided so, as typed in Settings. */
  decision_reason: z.string().min(1).optional(),
});
export type HarnessToolSchema = z.infer<typeof HarnessToolSchema>;
