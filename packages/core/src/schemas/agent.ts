/**
 * Agent schemas — the definition of who does a piece of work and on what.
 *
 * Why: until now the only knobs on a Worker were a lane model in a matrix and one harness per
 *   project; nobody could say "the reviewer is read-only, runs on a cheaper model and has these
 *   instructions" and see it recorded. An agent is that record: a role, instructions, where it
 *   runs (harness and model), which tools and paths it may touch, what it takes in and hands
 *   on, and its budget. Agents live in the versioned config rows (d-0085), so every save is
 *   audited and every run names the exact agent definition it used. The role bounds are part
 *   of the schema so a reviewer that can write can never be stored, whoever drafted it: the
 *   owner, a template or the Director.
 *
 * Exports: AgentId, AgentRole, ArtifactKind, ModelChoice, HarnessRef, AgentFallback, RunsOn,
 *   AgentBudget, AgentMemory, AgentOrigin, AgentFields, AgentDefinition, AgentInput,
 *   AgentsRecord, ProjectAgents, HarnessModel, MAX_AGENT_FALLBACKS (and their types).
 * Depends on: domain/agent-rules, schemas/harness, zod. No IO.
 */

import { z } from 'zod';
import { agentRuleIssues, forgeDefaultIssues } from '#/domain/agent-rules.js';
import { HarnessId } from '#/schemas/harness.js';

/** Lowercase slug, 2 to 48 characters; builtins are `implementer`, `test-writer`, `reviewer`, `critic`. */
export const AgentId = z.string().regex(/^[a-z][a-z0-9-]{1,47}$/);
export type AgentId = z.infer<typeof AgentId>;

/** What the agent is for; the role sets the bounds on its tools and write scope. */
export const AgentRole = z.enum(['writer', 'reviewer', 'tester', 'researcher']);
export type AgentRole = z.infer<typeof AgentRole>;

/** The typed artifacts an agent takes in and hands on (d-0070); stored now, used by pipelines. */
export const ArtifactKind = z.enum([
  'plan',
  'ticket',
  'diff',
  'finish_claims',
  'narrative',
  'test_report',
  'findings',
  'gate_report',
  'check_report',
]);
export type ArtifactKind = z.infer<typeof ArtifactKind>;

/**
 * Which model an agent asks for. `forge_default` is the company lane matrix and exists for the
 * built-in implementer only; `harness_default` sends no model, so the agent follows whatever
 * the harness chooses; `model` is a listed model or any custom id.
 */
export const ModelChoice = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('forge_default') }),
  z.object({ kind: z.literal('harness_default') }),
  z.object({ kind: z.literal('model'), id: z.string().min(1).max(120) }),
]);
export type ModelChoice = z.infer<typeof ModelChoice>;

/** `project_default` follows the project's `default_harness`; otherwise a harness id. */
export const HarnessRef = z.union([z.literal('project_default'), HarnessId]);
export type HarnessRef = z.infer<typeof HarnessRef>;

export const MAX_AGENT_FALLBACKS = 5;

export const AgentFallback = z.object({ harness: HarnessRef, model: ModelChoice });
export type AgentFallback = z.infer<typeof AgentFallback>;

/** Where an agent runs, with an ordered fallback list for quota and harness-down. */
export const RunsOn = z.object({
  harness: HarnessRef,
  model: ModelChoice,
  fallbacks: z.array(AgentFallback).max(MAX_AGENT_FALLBACKS),
  /**
   * What happens when the primary and every fallback fail: the Director picks a substitute agent, or
   * the ticket pauses for the owner. Absent reads as `director_substitute`; no default is written so
   * stored agent hashes do not change.
   */
  on_exhausted: z.enum(['director_substitute', 'pause']).optional(),
});
export type RunsOn = z.infer<typeof RunsOn>;

/** Per-agent limits; an absent key falls back to the company `engine.run_budget`. */
export const AgentBudget = z.object({
  usd: z.number().positive().optional(),
  minutes: z.number().int().positive().optional(),
  turns: z.number().int().positive().optional(),
});
export type AgentBudget = z.infer<typeof AgentBudget>;

/** Which project memory the agent sees: records carrying one of `tags` (empty means the whole slice). */
export const AgentMemory = z.object({
  tags: z.array(z.string().min(1)),
  include_rejected: z.boolean(),
});
export type AgentMemory = z.infer<typeof AgentMemory>;

/** Where a definition came from: shipped, typed in, a gallery template, the Director's draft or a copy. */
export const AgentOrigin = z.union([
  z.enum(['builtin', 'custom', 'director_draft']),
  z.string().regex(/^(template|duplicate):[a-z][a-z0-9-]*$/),
]);
export type AgentOrigin = z.infer<typeof AgentOrigin>;

/** The fields an owner edits; `AgentDefinition` and `AgentInput` are this plus their own bookkeeping. */
export const AgentFields = z.object({
  name: z.string().trim().min(1).max(60),
  /** The Director reads this to know when the agent applies. */
  description: z.string().trim().min(1).max(500),
  role: AgentRole,
  /** Markdown appended to the Worker's brief; empty is allowed. */
  instructions: z.string().max(20_000),
  runs_on: RunsOn,
  /** `lane_default` follows the lane; otherwise exactly these catalogue tool ids. */
  tools: z.union([z.literal('lane_default'), z.array(z.string().min(1))]),
  /** Globs of paths a writer or tester may change; reviewers and researchers have none. */
  write_scope: z.array(z.string().min(1)),
  inputs: z.array(ArtifactKind),
  output: z.array(ArtifactKind),
  skills: z.array(z.string().min(1)),
  memory: AgentMemory,
  budget: AgentBudget,
});

/** Adds the role-bound violations of `d` as zod issues on the field they concern. */
function checkRules(d: z.infer<typeof AgentFields>, ctx: z.RefinementCtx): void {
  for (const i of agentRuleIssues(d)) {
    ctx.addIssue({ code: 'custom', path: i.path, message: i.message });
  }
}

/** One stored agent: the fields plus whether it is archived and where it came from. */
export const AgentDefinition = AgentFields.extend({
  archived: z.boolean().default(false),
  origin: AgentOrigin,
}).superRefine(checkRules);
export type AgentDefinition = z.infer<typeof AgentDefinition>;

/** What a create or save sends: the editable fields only. */
export const AgentInput = AgentFields.superRefine(checkRules);
export type AgentInput = z.infer<typeof AgentInput>;

/** The company's agents by id: builtins plus overrides and custom agents; `forge_default` only on the implementer. */
export const AgentsRecord = z
  .record(AgentId, AgentDefinition)
  .superRefine((agents, ctx) => {
    for (const [id, def] of Object.entries(agents)) {
      for (const message of forgeDefaultIssues(id, def)) {
        ctx.addIssue({ code: 'custom', path: [id, 'runs_on'], message });
      }
    }
  });
export type AgentsRecord = z.infer<typeof AgentsRecord>;

/**
 * A project's agents: its own, its overrides of a company agent's instructions and runs_on
 * (nothing else may differ per project, d-0149) and the company agents switched off here.
 */
export const ProjectAgents = z.object({
  custom: z.record(AgentId, AgentDefinition).default({}),
  overrides: z
    .record(
      AgentId,
      z.object({
        instructions: z.string().max(20_000).optional(),
        runs_on: RunsOn.optional(),
      }),
    )
    .default({}),
  disabled: z.array(AgentId).default([]),
});
export type ProjectAgents = z.infer<typeof ProjectAgents>;

/** One model a harness offers, as its driver declares it. */
export const HarnessModel = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  speed: z.enum(['fast', 'balanced', 'deep']),
  cost: z.enum(['low', 'medium', 'high']),
  recommended_for: z.array(AgentRole),
});
export type HarnessModel = z.infer<typeof HarnessModel>;
