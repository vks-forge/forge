/**
 * Project config schema — the validated form of `.forge/project.yaml`.
 *
 * Why: the factory must work on repos in any language without code changes, so what
 *   varies per repo (which commands run tests and lint, whether TypeScript-specific
 *   gates apply, which harness Workers use, where the remote is) lives in
 *   `.forge/project.yaml`. Validating it at load, not when a gate first runs it, turns a
 *   typo into an immediate readable startup error instead of a Worker or gate failing
 *   mid-ticket. `default_harness` is an opaque id because core must not know which
 *   harnesses exist; drivers are chosen by config (d-0034, d-0027).
 *
 * Exports: Profile, ProjectCommands, ProjectConfig, Project.
 * Depends on: schemas/ids, zod. No IO.
 */

import { z } from 'zod';
import { ProjectPrefix } from '#/schemas/ids.js';

/** `ts` enables TS-bound gate checks; `generic` skips them with a reason (d-0034). */
export const Profile = z.enum(['ts', 'generic']);
export type Profile = z.infer<typeof Profile>;

/** Shell commands the gates run for a target repo; each optional. */
export const ProjectCommands = z.object({
  test: z.string().min(1).optional(),
  lint: z.string().min(1).optional(),
  typecheck: z.string().min(1).optional(),
  build: z.string().min(1).optional(),
});

/** `project.yaml` (d-0034). `default_harness` is an opaque id: core never names harnesses. */
export const ProjectConfig = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  prefix: ProjectPrefix,
  profile: Profile,
  commands: ProjectCommands.default({}),
  default_harness: z.string().min(1),
  remote: z.string().min(1).optional(),
});
export type ProjectConfig = z.infer<typeof ProjectConfig>;

/**
 * The `projects` table row (director-core.md §3): the registry the Director keeps of the
 * repos it works on. Distinct from `ProjectConfig`, which is the per-repo file; this is
 * the database's record of a project, with its origin, memory repo and the harness and
 * tier-C overrides the Director applies.
 */
export const Project = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  prefix: ProjectPrefix,
  repo_origin: z.string().min(1).optional(),
  memory_repo: z.string().min(1).optional(),
  harness_defaults: z.record(z.string(), z.unknown()),
  tier_c_globs: z.array(z.string()),
});
export type Project = z.infer<typeof Project>;
