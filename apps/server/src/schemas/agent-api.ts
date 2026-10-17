/**
 * Request bodies of the agent API.
 *
 * Why: every byte that arrives over HTTP is untrusted until a schema has parsed it (code.md
 *   rule 4). Agent writes all carry the version of the scope the editor saw and a reason, so a
 *   save that raced another is refused with 409 and every change is attributable. The agent
 *   inside a body is parsed with the plain field shape, not the refined one, because the role
 *   bounds and the tool list are checked by the agent store with their own error codes
 *   (`role_bounds`, `unknown_tool`) and the issues listed, which a generic schema failure
 *   could not name. Scope and project come from the path wherever the path has them.
 *
 * Exports: AgentCreateBody, AgentSaveBody, AgentActionBody, AgentDuplicateBody,
 *   ProjectAgentSaveBody, AgentOverride, AgentDraftBody, AgentTestBody, DraftAgentWire (and their
 *   types), OVERRIDE_KEYS.
 * Depends on: @forge/core (AgentFields, AgentOrigin, RunsOn, ProjectSlug rules), zod. No IO.
 */

import { AgentFields, AgentOrigin, RunsOn } from '@forge/core';
import { z } from 'zod';

const Version = z.number().int().nonnegative();
const Reason = z.string().trim().min(3).max(500);
const Slug = z.string().regex(/^[a-z][a-z0-9-]*$/);

/** Origins a new agent may claim; `builtin` is only for what the release ships. */
const NewOrigin = AgentOrigin.refine(
  (o) => o !== 'builtin',
  'origin builtin is reserved',
);

/** `POST /settings/agents` and `POST /settings/projects/:slug/agents`. */
export const AgentCreateBody = z.strictObject({
  agent: AgentFields,
  origin: NewOrigin,
  expected_version: Version,
  reason: Reason,
});
export type AgentCreateBody = z.infer<typeof AgentCreateBody>;

/** `PUT /settings/agents/:id`. */
export const AgentSaveBody = z.strictObject({
  agent: AgentFields,
  expected_version: Version,
  reason: Reason,
});
export type AgentSaveBody = z.infer<typeof AgentSaveBody>;

/** reset, archive, unarchive, disable, enable, reset-override. */
export const AgentActionBody = z.strictObject({
  expected_version: Version,
  reason: Reason,
});
export type AgentActionBody = z.infer<typeof AgentActionBody>;

/** `POST /settings/agents/:id/duplicate` (target scope in the body). */
export const AgentDuplicateBody = z.strictObject({
  name: z.string().trim().min(1).max(60),
  scope: z.enum(['company', 'project']),
  project: Slug.optional(),
  expected_version: Version,
  reason: Reason,
});
export type AgentDuplicateBody = z.infer<typeof AgentDuplicateBody>;

/** The only fields a project may override on a company agent (d-0149). */
export const OVERRIDE_KEYS = ['instructions', 'runs_on'] as const;

/**
 * `PUT /settings/projects/:slug/agents/:id`: a project agent sends `{ agent }`, a company agent
 * sends `{ override }`. The override is read as a loose record so a field that is not
 * overridable is answered with `override_fields`, not a generic validation failure.
 */
export const ProjectAgentSaveBody = z.strictObject({
  agent: AgentFields.optional(),
  override: z.record(z.string(), z.unknown()).optional(),
  expected_version: Version,
  reason: Reason,
});
export type ProjectAgentSaveBody = z.infer<typeof ProjectAgentSaveBody>;

/** The override of a company agent once its keys are known to be allowed. */
export const AgentOverride = z.strictObject({
  instructions: z.string().max(20_000).optional(),
  runs_on: RunsOn.optional(),
});
export type AgentOverride = z.infer<typeof AgentOverride>;

/** `POST /agents/draft`. */
export const AgentDraftBody = z.strictObject({
  description: z.string().trim().min(10).max(2000),
  scope: z.enum(['company', 'project']),
  project: Slug.optional(),
});
export type AgentDraftBody = z.infer<typeof AgentDraftBody>;

/** `POST /agents/test`. */
export const AgentTestBody = z.strictObject({
  agent: AgentFields,
  project: Slug.optional(),
});
export type AgentTestBody = z.infer<typeof AgentTestBody>;

/**
 * What the `draft_agent` step is held to at the model boundary: the plain field shape, so a
 * draft that breaks a role bound still parses and the service can list every broken rule as
 * issues of a 422, instead of the step failing with one generic message.
 */
export const DraftAgentWire = z.object({
  definition: AgentFields,
  rationale: z.string().max(1000),
  questions: z.array(z.string()).max(3),
});
export type DraftAgentWire = z.infer<typeof DraftAgentWire>;
