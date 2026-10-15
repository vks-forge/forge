/**
 * Response schema of `GET /projects`.
 *
 * Why: the project switcher is the first thing every screen depends on, and a server that
 *   drifts from what the UI expects should fail loudly at the boundary with a named field, not
 *   as `undefined` deep inside a component. The shape mirrors apps/server `routes/projects.ts`
 *   (`view()`): the stored project row of `@forge/core` without the two deprecated columns
 *   (`tier_c_globs`, `harness_defaults`), plus `config_error` when the project's settings no
 *   longer validate. It is derived from core's `Project`, so a column added there reaches the
 *   UI with no edit here.
 *
 * Exports: ProjectView, ProjectsResponse (schemas and inferred types).
 * Depends on: @forge/core (Project), zod.
 */

import { Project } from '@forge/core';
import { z } from 'zod';

export const ProjectView = Project.omit({
  tier_c_globs: true,
  harness_defaults: true,
}).extend({
  config_error: z.string().optional(),
});
export type ProjectView = z.infer<typeof ProjectView>;

export const ProjectsResponse = z.object({ projects: z.array(ProjectView) });
export type ProjectsResponse = z.infer<typeof ProjectsResponse>;
