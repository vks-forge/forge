/**
 * Floors — hardline deny rules no lane, project, ticket or approval can lift.
 *
 * Why: some actions are never what a Worker should do unattended whatever a ticket says:
 *   wiping the filesystem, pushing to a remote (the dispatcher merges, d-0012), publishing
 *   a package, reading credential files, writing outside the worktree, or editing the
 *   policy files that define these very limits. They are expressed as managed deny rules
 *   so they sit in the one layer that is evaluated last and can only tighten, and they
 *   hold inside containers too (tool-system.md §5.0, §13).
 *
 * Exports: FLOOR_RULES, PROTECTED_PATHS, CREDENTIAL_PATHS.
 * Depends on: schemas/grant. No IO.
 */

import type { CallRule } from '#/schemas/grant.js';

export const CREDENTIAL_PATHS: readonly string[] = [
  '**/.env',
  '**/.env.local',
  '**/.env.production',
  '**/*.pem',
  '**/id_rsa*',
  '**/id_ed25519*',
  '**/.ssh/**',
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

/** Matched on the normalised segment text, so quoting tricks do not hide a floor. */
export const FLOOR_RULES: readonly CallRule[] = [
  ...SHELL_DENY.map((r) => rule('shell', r)),
  ...['read', 'edit', 'write'].flatMap((a) => CREDENTIAL_PATHS.map((p) => rule(a, p))),
  ...['edit', 'write'].flatMap((a) =>
    ['.forge/tools/**', '..', '../**', '/**', '?:/**'].map((p) => rule(a, p)),
  ),
];
