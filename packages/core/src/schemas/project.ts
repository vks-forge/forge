/**
 * Project config schema — the validated form of `.forge/project.yaml`.
 *
 * Why: the factory works on repos of any language through a small per-project config
 *   (d-0034, d-0027); config over code (code.md rule 9) means core validates it at
 *   load. `default_harness` is an opaque id so core never names a harness (code.md rule
 *   3).
 *
 * Exports: Profile, ProjectCommands, ProjectConfig.
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
