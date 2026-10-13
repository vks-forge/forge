/**
 * ToolDefinition schema — one catalogue entry describing a tool Workers may be given.
 *
 * Why: Workers run in harnesses that each name, expose and enforce tools differently,
 *   and a tool's danger cannot be read off its name or the model's own claim. The
 *   definition records what the operator declared: risk class, how it is shown, which
 *   tools it can reach, which resources it locks, its schema hash, and per-harness
 *   whether a deny is actually enforced. Policy, receipts and the Ticket screen all key
 *   off these fields, so a malformed entry is rejected at load instead of silently
 *   widening a run (tool-system.md §4).
 *
 * Exports: ToolKind, Risk, Exposure, Enforcement, NativeName, HarnessSupport, ToolDefinition,
 *   TOOL_ID_PATTERN.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** `mcp__<server>__<tool>` for MCP tools, a lowercase snake name for harness-native ones. */
export const TOOL_ID_PATTERN =
  /^(?:mcp__[a-z0-9-]+__[a-z0-9_-]+|(?!mcp__)[a-z][a-z0-9_]*)$/;

export const ToolKind = z.enum([
  'harness-native',
  'factory-core',
  'factory-capability',
  'project',
  'gate-only',
]);
export type ToolKind = z.infer<typeof ToolKind>;

/** Declared (never inferred) risk class, weakest to strongest. */
export const Risk = z.enum([
  'read',
  'write-cwd',
  'exec',
  'network',
  'credential',
  'destructive',
]);
export type Risk = z.infer<typeof Risk>;

export const Exposure = z.enum(['direct', 'deferred', 'codemode', 'hidden']);
export type Exposure = z.infer<typeof Exposure>;

/** Who actually enforces a deny for a tool on a harness (coverage honesty, §7). */
export const Enforcement = z.enum([
  'os',
  'harness',
  'hook',
  'in-tool',
  'server',
  'attribution-only',
]);
export type Enforcement = z.infer<typeof Enforcement>;

/**
 * One harness-native tool name, or several when a harness reports a single capability
 * under different names (Claude Code says `PowerShell` on Windows, `Bash` over ACP).
 */
export const NativeName = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);
export type NativeName = z.infer<typeof NativeName>;

export const HarnessSupport = z.object({
  native: NativeName.optional(),
  mechanism: z.string().min(1),
  enforced: Enforcement,
});
export type HarnessSupport = z.infer<typeof HarnessSupport>;

export const ToolDefinition = z.object({
  id: z.string().regex(TOOL_ID_PATTERN),
  kind: ToolKind,
  version: z.string().min(1),
  risk: Risk,
  exposure: Exposure,
  reaches_tools: z.array(z.string().min(1)).default([]),
  resources: z.array(z.string().min(1)).default([]),
  cost_class: z.enum(['free', 'metered']).default('free'),
  taints: z.boolean().default(false),
  schema_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  support: z.record(z.string().min(1), HarnessSupport),
  denies_native: z.array(z.string().min(1)).default([]),
});
export type ToolDefinition = z.infer<typeof ToolDefinition>;
