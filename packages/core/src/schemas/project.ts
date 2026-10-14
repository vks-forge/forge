/**
 * Project config schema — the validated form of `.forge/project.yaml`.
 *
 * Why: the factory must work on repos in any language without code changes, so what
 *   varies per repo (which commands run tests and lint, whether TypeScript-specific
 *   gates apply, which harness Workers use, where the remote is, which paths need a human) lives in
 *   `.forge/project.yaml`. Validating it at load, not when a gate first runs it, turns a
 *   typo into an immediate readable startup error instead of a Worker or gate failing
 *   mid-ticket. `default_harness` is an opaque id because core must not know which
 *   harnesses exist; drivers are chosen by config (d-0034, d-0027).
 *
 * Exports: Profile, ProjectCommands, GitHostConfig, ProjectConfig, ProjectStatus, Project.
 * Depends on: schemas/ids, schemas/secret-name, zod. No IO.
 */

import { z } from 'zod';
import { ProjectPrefix } from '#/schemas/ids.js';
import { SecretName } from '#/schemas/secret-name.js';

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

/**
 * Where branches are pushed and PRs live (d-0062). `local` is a bare repo on disk; `github`
 * is a GitHub App installation. Ids are not secrets; the App's private key is read from the
 * SecretStore under `key_secret`.
 */
export const GitHostConfig = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('local'),
    remote_path: z.string().min(1),
    base_branch: z.string().min(1).default('main'),
  }),
  z.object({
    kind: z.literal('github'),
    owner: z.string().min(1),
    repo: z.string().min(1),
    base_branch: z.string().min(1).default('main'),
    /** Omitted when the project is linked to a connection: the App id then comes from the connection. */
    app_id: z
      .string()
      .regex(/^[0-9]+$/)
      .optional(),
    installation_id: z.string().regex(/^[0-9]+$/),
    /** Omitted when the project is linked to a connection: the key then comes from the connection. */
    key_secret: SecretName.optional(),
  }),
]);
export type GitHostConfig = z.infer<typeof GitHostConfig>;

/** `project.yaml` (d-0034). `default_harness` is an opaque id: core never names harnesses. */
export const ProjectConfig = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  prefix: ProjectPrefix,
  profile: Profile,
  commands: ProjectCommands.default({}),
  default_harness: z.string().min(1),
  remote: z.string().min(1).optional(),
  git_host: GitHostConfig.optional(),
  /**
   * Paths whose change makes a ticket Tier C (a human must sign off) even when triage
   * predicted tier A: Forge's own policy, config and memory, harness settings and CI.
   * Matched with `globMatch` ignoring case (see shared/glob.ts); the default is the safe
   * set, and listing your own replaces it, so keep these three in any list you write.
   */
  tier_c_globs: z
    .array(z.string().min(1))
    .default(['.forge/**', '.claude/**', '.github/**']),
});
export type ProjectConfig = z.infer<typeof ProjectConfig>;

/** `onboarding`: registered, not yet checked; `ready`: tickets run; `archived`: kept for history, no new work. */
export const ProjectStatus = z.enum(['onboarding', 'ready', 'archived']);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

/**
 * The `projects` table row (director-core.md §3): the registry the Director keeps of the
 * repos it works on. Distinct from `ProjectConfig`, the settings shape; this is the
 * database's record of a project: identity, where its clone lives on this machine, which
 * GitHub connection and repository it belongs to, its lifecycle status and detected
 * ecosystems. Git host, commands and tier-C paths are settings (versioned), not columns.
 */
export const Project = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  prefix: ProjectPrefix,
  repo_origin: z.string().min(1).optional(),
  memory_repo: z.string().min(1).optional(),
  /** Absolute path of the project's local clone; Worker worktrees are cut from it. */
  local_path: z.string().min(1).optional(),
  /** The GitHub connection (App) this project's repository is reached through, when it has one. */
  connection_id: z.string().min(1).optional(),
  /** `owner/name` of the GitHub repository, when the project has one. */
  repo_full_name: z
    .string()
    .regex(/^[^/\s]+\/[^/\s]+$/)
    .optional(),
  status: ProjectStatus.default('ready'),
  /** Ecosystems detected in the repository (`node`, `python`, ...); filled by onboarding. */
  ecosystems: z.array(z.string().min(1)).default([]),
  harness_defaults: z.record(z.string(), z.unknown()),
  /** @deprecated Settings own tier-C paths since B3b (`ProjectSettings.tier_c_globs`); stored, never read. */
  tier_c_globs: z.array(z.string()).default([]),
});
export type Project = z.infer<typeof Project>;
