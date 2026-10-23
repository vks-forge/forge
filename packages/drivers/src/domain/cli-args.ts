/**
 * Builds the `claude -p` command line for one run.
 *
 * Why: on the CLI engine the flags are the isolation. `--setting-sources ""` loads no user
 *   or project settings, `--settings` adds only the per-run hook settings, `--mcp-config`
 *   with `--strict-mcp-config` exposes only the run's MCP servers, and the budget, turn and
 *   model flags are the harness-side caps (probe 1 measured each). `--permission-mode
 *   default` keeps tools prompting unless allowed, and `-p` has no human to ask, so the
 *   request's allow and deny lists are passed through as `--allowedTools` /
 *   `--disallowedTools` (comma-joined: the flags are variadic and would swallow the next
 *   argument, probe 2). The prompt is not here: it goes on stdin so it never appears in a
 *   process listing or hits a Windows command-line length limit. When the request says
 *   `permissions: 'bypass'` (the harness's "Bypass permissions" switch, d-0183) the mode is
 *   `bypassPermissions` so the harness never stops to ask; Forge's PreToolUse hook still runs
 *   and enforces the hard floor (probe 8), and the allow and deny lists are passed unchanged.
 *
 * Exports: buildCliArgs().
 * Depends on: @forge/core (RunRequest), types/claude/engine. No IO.
 */

import type { RunRequest } from '@forge/core';
import type { RunFiles } from '#/types/claude/engine.types.js';

const unique = (...lists: readonly (readonly string[] | undefined)[]): string[] => [
  ...new Set(lists.flatMap((l) => l ?? [])),
];

export function buildCliArgs(
  req: RunRequest,
  files: RunFiles,
  resumeSession: string | undefined,
): string[] {
  const allow = unique(req.permissionPolicy?.allow, req.tools?.allow);
  const deny = unique(req.permissionPolicy?.deny, req.tools?.deny);

  return [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--setting-sources',
    '',
    '--settings',
    files.settingsPath,
    '--mcp-config',
    files.mcpConfigPath,
    '--strict-mcp-config',
    '--max-budget-usd',
    String(req.budget.maxUsd),
    '--max-turns',
    String(req.budget.maxTurns),
    // No model for an agent set to "harness default": the CLI then picks its own.
    ...(req.model === undefined ? [] : ['--model', req.model]),
    '--permission-mode',
    req.permissions === 'bypass' ? 'bypassPermissions' : 'default',
    ...(resumeSession ? ['--resume', resumeSession] : []),
    ...(allow.length > 0 ? ['--allowedTools', allow.join(',')] : []),
    ...(deny.length > 0 ? ['--disallowedTools', deny.join(',')] : []),
  ];
}
