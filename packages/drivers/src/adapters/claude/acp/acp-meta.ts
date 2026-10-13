/**
 * Builds the per-run ACP session options and MCP server list.
 *
 * Why: the ACP adapter takes Claude Code's run options through
 *   `_meta.claudeCode.options`, and a wrong or missing field silently weakens isolation:
 *   without `settingSources: []` and `strictMcpConfig` the Worker inherits the user's
 *   settings and MCP servers, without `allowDangerouslySkipPermissions: false` a bypass mode
 *   is selectable, and without the budget fields the caps are not enforced by the harness.
 *   Building the object in one pure function pins that set (d-0035) so every `session/new`
 *   and `session/load` sends exactly the same, and `settings` points at the per-run hook
 *   settings the driver rendered (probe 5a).
 *
 * Exports: sessionMeta(), toAcpMcpServers().
 * Depends on: @agentclientprotocol/sdk (types), @forge/core (RunRequest),
 *   types/claude/driver-deps, types/claude/engine. No IO.
 */

import type { McpServer } from '@agentclientprotocol/sdk';
import type { RunRequest } from '@forge/core';
import type { McpServerSpec } from '#/types/claude/driver-deps.types.js';
import type { RunFiles } from '#/types/claude/engine.types.js';

/** `_meta` for `session/new` and `session/load`. */
export function sessionMeta(req: RunRequest, files: RunFiles): Record<string, unknown> {
  return {
    claudeCode: {
      options: {
        settingSources: [],
        strictMcpConfig: true,
        allowDangerouslySkipPermissions: false,
        maxTurns: req.budget.maxTurns,
        maxBudgetUsd: req.budget.maxUsd,
        model: req.model,
        settings: files.settingsPath,
      },
    },
  };
}

/** Stdio MCP servers in ACP's shape (env as a name/value list). */
export function toAcpMcpServers(specs: readonly McpServerSpec[]): McpServer[] {
  return specs.map((s) => ({
    name: s.name,
    command: s.command,
    args: [...s.args],
    env: Object.entries(s.env).map(([name, value]) => ({ name, value })),
  }));
}
