/**
 * Agent view and API shapes — what the settings screens read about agents.
 *
 * Why: the screens must not re-derive which agents exist for a scope, which are built in,
 *   edited, switched off or archived, or whether the harness an agent names can run today. The
 *   server computes one `AgentView` per agent and the client shows it, so the tags, the hash
 *   and the readiness reasons are the same everywhere. These shapes are also the contract the
 *   web mirrors, so they stay plain data: no refinements the client would have to repeat.
 *
 * Exports: AgentTag, AgentReadiness, AgentView, AgentTemplate, AgentChange, AgentHistoryEntry,
 *   RunsOnHarness, AgentTestResult (and their types).
 * Depends on: schemas/agent, schemas/errors, schemas/harness-compat, schemas/harness, zod. No IO.
 */

import { z } from 'zod';
import { AgentDefinition, AgentId, AgentInput, HarnessModel } from '#/schemas/agent.js';
import { ErrorFamily } from '#/schemas/errors.js';
import { CompatStatus } from '#/schemas/harness-compat.js';
import { HarnessKind } from '#/schemas/harness.js';

/** Why an agent is listed the way it is; one agent can carry several. */
export const AgentTag = z.enum([
  'builtin',
  'company',
  'overridden',
  'project',
  'disabled',
  'archived',
]);
export type AgentTag = z.infer<typeof AgentTag>;

/** Whether the harness an agent names can start a run now, and if not, why in plain words. */
export const AgentReadiness = z.object({
  ready: z.boolean(),
  reasons: z.array(z.string()),
});
export type AgentReadiness = z.infer<typeof AgentReadiness>;

/** One row of an agent list: the effective definition with everything a screen needs next to it. */
export const AgentView = z.object({
  id: AgentId,
  scope: z.enum(['company', 'project']),
  tags: z.array(AgentTag),
  /** The effective definition: a project override already laid over the company one. */
  definition: AgentDefinition,
  /** The company definition under a project override. */
  base: AgentDefinition.optional(),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  readiness: AgentReadiness,
});
export type AgentView = z.infer<typeof AgentView>;

/** A gallery entry: not part of the roster until the owner picks it. */
export const AgentTemplate = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string().min(1),
  summary: z.string().min(1),
  definition: AgentInput,
});
export type AgentTemplate = z.infer<typeof AgentTemplate>;

/** What one saved version did to one agent. */
export const AgentChange = z.enum([
  'created',
  'edited',
  'reset',
  'archived',
  'unarchived',
  'disabled',
  'enabled',
]);
export type AgentChange = z.infer<typeof AgentChange>;

/** One line of an agent's history, derived from its scope's version history. */
export const AgentHistoryEntry = z.object({
  version: z.number().int().positive(),
  author: z.string().min(1),
  reason: z.string().min(1),
  created_at: z.number().int().nonnegative(),
  change: AgentChange,
});
export type AgentHistoryEntry = z.infer<typeof AgentHistoryEntry>;

/** A configured harness as the agent editor's picker sees it, ready or not. */
export const RunsOnHarness = z.object({
  id: z.string().min(1),
  kind: HarnessKind,
  version: z.string().min(1).optional(),
  signed_in: z.boolean(),
  compat: CompatStatus,
  paused_until: z.string().optional(),
  ready: z.boolean(),
  reasons: z.array(z.string()),
  /** Where the owner fixes it (a path in the web app). */
  fix_href: z.string(),
  models: z.array(HarnessModel),
  models_checked_at: z.iso.datetime().optional(),
});
export type RunsOnHarness = z.infer<typeof RunsOnHarness>;

/** The answer of one "Test agent" call; a failed probe is a result with `ok: false`, not an error. */
export const AgentTestResult = z.object({
  ok: z.boolean(),
  reply: z.string().max(2000).optional(),
  model_used: z.string().optional(),
  harness_id: z.string().min(1),
  duration_ms: z.number().int().nonnegative(),
  cost_usd: z.number().nonnegative().optional(),
  error: z.object({ family: ErrorFamily, message: z.string() }).optional(),
});
export type AgentTestResult = z.infer<typeof AgentTestResult>;
