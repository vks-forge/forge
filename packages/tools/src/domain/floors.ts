/**
 * Floors — hardline deny rules no lane, project, ticket or approval can lift.
 *
 * Why: some actions are never what a Worker should do unattended whatever a ticket says:
 *   wiping the filesystem, pushing to a remote (the dispatcher merges, d-0012), publishing
 *   a package, reading credential files, writing outside the worktree, reading Forge's own
 *   data home (guarded by absolute path in data-home-floor), reading the harness's own user config (which holds its logins), or
 *   editing the policy files that define these very limits. They are expressed as managed
 *   deny rules so they sit in the one layer that is evaluated last and can only tighten,
 *   and they hold inside containers too (tool-system.md §5.0, §13). Every path tool is
 *   covered (read, grep, glob, edit, write), the directory itself is floored as well as
 *   what is under it (`x/**` does not match `x`). Path matching is case-insensitive (see shared/path.ts).
 *
 * Exports: FLOOR_RULES, PROTECTED_PATHS, CREDENTIAL_PATHS, HARNESS_CONFIG_PATHS,
 *   OUTSIDE_CWD_PATHS.
 * Depends on: schemas/grant. No IO. Forge's own data folder is not a glob here: it is an absolute
 *   path that depends on the machine, so domain/data-home-floor guards it.
 */

import type { CallRule } from '#/schemas/grant.js';

export const CREDENTIAL_PATHS: readonly string[] = [
  '**/.env',
  '**/.env.local',
  '**/.env.production',
  '**/*.pem',
  '**/id_rsa*',
  '**/id_ed25519*',
  '**/.ssh',
  '**/.ssh/**',
  '**/.aws',
  '**/.aws/credentials',
  '**/.npmrc',
];

/** Edits here always need a human, in every lane (Roo-style protected-path shield, §13). */
export const PROTECTED_PATHS: readonly string[] = [
  '.forge/**',
  'CLAUDE.md',
  '**/CLAUDE.md',
  'AGENTS.md',
  '**/AGENTS.md',
  '.claude/**',
  '.codex/**',
  'opencode.json',
];

/** The harness's per-user config and logins; never readable by a Worker, inside the cwd or out. */
export const HARNESS_CONFIG_PATHS: readonly string[] = [
  '**/.claude',
  '**/.claude/**',
  '**/.claude.json',
  '**/.codex',
  '**/.codex/**',
];

/** Anything that resolves outside the worktree (relative climb, drive, UNC, home). */
export const OUTSIDE_CWD_PATHS: readonly string[] = [
  '..',
  '../**',
  '/**',
  '//**',
  '?:/**',
];

/** Paths whose edit is code execution or policy change; floored for edit and write only. */
const WRITE_ONLY_FLOORS: readonly string[] = [
  '**/.forge/tools',
  '**/.forge/tools/**',
  '**/.git',
  '**/.git/**',
];

const SHELL_DENY: readonly string[] = [
  'git push*',
  'npm publish*',
  'pnpm publish*',
  'yarn publish*',
  'cargo publish*',
  'twine upload*',
  'rm -rf /',
  'rm -rf / *',
  'rm -fr /',
  'rm -fr / *',
  'rm -rf ~',
  'rm -rf ~ *',
  'rm -rf $HOME',
  'rm -rf $HOME *',
  'Remove-Item -Recurse -Force /',
  'Remove-Item -Recurse -Force /*',
  'Remove-Item -Recurse -Force ~',
];

const rule = (action: string, resource: string): CallRule => ({
  action,
  resource,
  effect: 'deny',
});

const PATH_TOOLS = ['read', 'grep', 'glob', 'edit', 'write'];
const READ_TOOLS = ['read', 'grep', 'glob'];
const WRITE_TOOLS = ['edit', 'write'];

const forEach = (actions: readonly string[], paths: readonly string[]): CallRule[] =>
  actions.flatMap((a) => paths.map((p) => rule(a, p)));

/** Matched on the normalised segment text, so quoting tricks do not hide a floor. */
export const FLOOR_RULES: readonly CallRule[] = [
  ...SHELL_DENY.map((r) => rule('shell', r)),
  ...forEach(PATH_TOOLS, [...CREDENTIAL_PATHS, ...OUTSIDE_CWD_PATHS]),
  ...forEach(READ_TOOLS, HARNESS_CONFIG_PATHS),
  ...forEach(WRITE_TOOLS, WRITE_ONLY_FLOORS),
];
