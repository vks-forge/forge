/**
 * Request bodies of the pipeline API.
 *
 * Why: every byte that arrives over HTTP is untrusted until a schema has parsed it (code.md
 *   rule 4). Pipeline writes carry the version of the scope the editor saw and a reason, so a
 *   save that raced another is refused with 409 and every change is attributable. The pipeline
 *   inside a body is parsed with the core stage shapes (strict, so a typo is refused), but the
 *   rules that make a list safe (merge last, G1 once, nobody checks their own work) are not
 *   schema refinements: the store runs them with their own codes and lists every problem, which
 *   a generic validation failure could not name. The lane comes from the path wherever the
 *   path has it; the validate body names it because nothing is saved.
 *
 * Exports: PipelineSaveBody, PipelineResetBody, RoutingSaveBody, PipelineValidateBody (and their types).
 * Depends on: @forge/core (PipelineDefinition, RoutingRule, Lane), zod. No IO.
 */

import { Lane, MAX_ROUTING_RULES, PipelineDefinition, RoutingRule } from '@forge/core';
import { z } from 'zod';

const Version = z.number().int().nonnegative();
const Reason = z.string().trim().min(3).max(500);
const Slug = z.string().regex(/^[a-z][a-z0-9-]*$/);

/** `PUT /settings/pipelines/:lane` and `PUT /settings/projects/:slug/pipelines/:lane`. */
export const PipelineSaveBody = z.strictObject({
  pipeline: PipelineDefinition,
  expected_version: Version,
  reason: Reason,
});
export type PipelineSaveBody = z.infer<typeof PipelineSaveBody>;

/** The two reset routes. */
export const PipelineResetBody = z.strictObject({
  expected_version: Version,
  reason: Reason,
});
export type PipelineResetBody = z.infer<typeof PipelineResetBody>;

/** `PUT /settings/projects/:slug/routing`: the whole rule list replaces the stored one. */
export const RoutingSaveBody = z.strictObject({
  rules: z.array(RoutingRule).max(MAX_ROUTING_RULES),
  expected_version: Version,
  reason: Reason,
});
export type RoutingSaveBody = z.infer<typeof RoutingSaveBody>;

/** `POST /settings/pipelines/validate`: judged against `project`'s roster when given, else the company's. */
export const PipelineValidateBody = z.strictObject({
  lane: Lane,
  pipeline: PipelineDefinition,
  project: Slug.optional(),
});
export type PipelineValidateBody = z.infer<typeof PipelineValidateBody>;
