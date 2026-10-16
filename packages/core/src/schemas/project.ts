/**
 * Project config schema — the validated form of `.forge/project.yaml`.
 *
 * Why: the factory must work on repos in any language without code changes, so what
 *   varies per repo (the checks to run and their roles, which ecosystems' gate rules
 *   apply, which harness Workers use, where the remote is, which paths need a human) lives
 *   in project settings. Validating it at load, not when a gate first runs it, turns a
 *   typo into an immediate readable startup error instead of a Worker or gate failing
 *   mid-ticket. `default_harness` is an opaque id because core must not know which
 *   harnesses exist; drivers are chosen by config (d-0095, d-0027).
 *
 * Exports: CheckRole, ProjectCheck, GateRules, GitHostConfig, ToolGrantConfig, ProjectConfigShape, ProjectConfig,
 *   ProjectStatus, Project.
 * Depends on: domain/legacy-project-doc, schemas/director-config, schemas/ids, schemas/secret-name,
 *   shared/deep-partial, types/config.types, zod. No IO.
 */

import { z } from 'zod';
import {
  legacyProjectDocProblem,
  migrateLegacyProjectDoc,
} from '#/domain/legacy-project-doc.js';
import { DirectorConfig } from '#/schemas/director-config.js';
import { ProjectPrefix } from '#/schemas/ids.js';
import { SecretName } from '#/schemas/secret-name.js';
import { deepPartial } from '#/shared/deep-partial.js';
import type { DeepPartial } from '#/types/config.types.js';

/** What a check is for; gates and the Worker contract read the role, never the name. */
export const CheckRole = z.enum([
  'test',
  'lint',
  'typecheck',
  'build',
  'format',
  'custom',
]);
export type CheckRole = z.infer<typeof CheckRole>;

/** A working directory inside the worktree: relative, no `..` segment. */
const RelativeDir = z
  .string()
  .min(1)
  .refine(
    (p) => !/^([a-z]:)?[\\/]/i.test(p) && !p.split(/[\\/]/).includes('..'),
    'must be a relative path inside the repository',
  );

/**
 * One named command the gates run in the project's worktree (d-0095). `command` is a shell
 * line run as written; `cwd` is relative to the repository root.
 */
export const ProjectCheck = z.object({
  name: z.string().min(1),
  role: CheckRole,
  command: z.string().trim().min(1),
  cwd: RelativeDir.optional(),
});
export type ProjectCheck = z.infer<typeof ProjectCheck>;

const Checks = z
  .array(ProjectCheck)
  .refine(
    (list) => new Set(list.map((c) => c.name)).size === list.length,
    'check names must be unique',
  );

const Glob = z.string().min(1);

const RegexSource = z
  .string()
  .min(1)
  .refine((p) => {
    try {
      new RegExp(p);

      return true;
    } catch {
      return false;
    }
  }, 'must be a valid regular expression');

/**
 * Project edits to the per-ecosystem gate rules (config-guard files, test-file patterns,
 * test-weakening markers). Lists add to the ecosystem data; `replace` makes them the only
 * rules. `skip_patterns` are regular expressions matched against added test lines.
 */
export const GateRules = z
  .object({
    config_globs: z.array(Glob).default([]),
    test_globs: z.array(Glob).default([]),
    skip_patterns: z.array(RegexSource).default([]),
    replace: z.boolean().default(false),
  })
  .strict();
export type GateRules = z.infer<typeof GateRules>;

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
  /** No remote: verified work merges into the base branch of the project's own repository (d-0124). */
  z.object({
    kind: z.literal('local_repo'),
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

/**
 * What the project lets Workers use beyond the lane defaults: the same shape as a tool
 * `Grant` in `@forge/tools` (that package parses it again before use, so a malformed one
 * fails closed). `allow` narrows what the lane offers, or names project MCP tools; `deny`
 * always wins; `rules` are call-time allow/ask/deny rules.
 */
export const ToolGrantConfig = z.object({
  allow: z.array(z.string().min(1)).optional(),
  deny: z.array(z.string().min(1)).default([]),
  rules: z
    .array(
      z.object({
        id: z.string().min(1).optional(),
        action: z.string().min(1),
        resource: z.string(),
        effect: z.enum(['allow', 'ask', 'deny']),
        save: z.string().optional(),
      }),
    )
    .default([]),
});
export type ToolGrantConfig = z.infer<typeof ToolGrantConfig>;

/** A project's partial Director settings: every key optional, lists and playbook bodies replace whole. */
const DirectorOverride = deepPartial(DirectorConfig) as unknown as z.ZodType<
  DeepPartial<DirectorConfig>
>;

/** The settings shape (d-0095). `default_harness` is an opaque id: core never names harnesses. */
export const ProjectConfigShape = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  prefix: ProjectPrefix,
  /** Run in list order by G1; any role may be absent. */
  checks: Checks.default([]),
  /** `node`, `python`, `go`, ...; empty means the gates detect them from the diff. */
  ecosystems: z.array(z.string().min(1)).default([]),
  gate_rules: GateRules.optional(),
  default_harness: z.string().min(1),
  /** Lowers this project's own concurrent Workers below the company's `max_concurrent_per_project`; it can never raise it (d-0097). */
  max_concurrent: z.number().int().positive().optional(),
  /** Harnesses to try, in order, when `default_harness` is out of quota; absent inherits the company list, empty means wait (d-0080). */
  harness_fallbacks: z.array(z.string().min(1)).optional(),
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
  /** Project-wide tool grant (B7); absent means the lane defaults alone. */
  tool_grants: ToolGrantConfig.optional(),
  /**
   * This project's overrides of the company's Director settings (flow, playbooks, house
   * rules, limits); only the keys it names differ. `mergeConfig` lays them over the company
   * `director` section, so the engine reads one effective `forge.director`.
   */
  director: DirectorOverride.optional(),
});

/**
 * Settings as read from storage or a file. Documents written before checks existed
 * (`profile` + `commands`) are converted first; see `migrateLegacyProjectDoc`.
 */
export const ProjectConfig = z.preprocess((value, ctx) => {
  const problem = legacyProjectDocProblem(value);
  if (problem !== null) {
    ctx.issues.push({ code: 'custom', message: problem, input: value });
  }

  return migrateLegacyProjectDoc(value);
}, ProjectConfigShape);
export type ProjectConfig = z.infer<typeof ProjectConfigShape>;

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
  /**
   * Top folder of the repository when the project is scoped to a subfolder of it (d-0124);
   * absent when `local_path` is itself the repository top. Worktrees are cut from here.
   */
  repo_root: z.string().min(1).optional(),
  /** Path of the project's folder from `repo_root`, forward slashes; set together with `repo_root`. */
  subfolder: z.string().min(1).optional(),
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
