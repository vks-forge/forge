/**
 * createForgeMcpServer — the `forge` MCP server for one run.
 *
 * Why: a Worker gets its Forge-provided tools only through this server, as
 *   `mcp__forge__<tool>`, so every call passes the same hooks and admission as native
 *   tools. It authenticates the run once at startup (wrong token or a run that is not
 *   running means it never serves), then re-checks the run on every call, and turns
 *   every failure into an MCP tool error: an exception must never escape and kill the
 *   stdio process in the middle of a Worker's turn.
 *
 * Exports: createForgeMcpServer(), SERVER_NAME.
 * Depends on: @modelcontextprotocol/sdk, @forge/core, domain/run-log, domain/tools/all-tools. IO: storage via deps.
 */

import { randomUUID } from 'node:crypto';
import { AuthError, ForgeError, PolicyDeniedError } from '@forge/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadActiveRun } from '#/domain/run-log.js';
import { FORGE_TOOLS } from '#/domain/tools/all-tools.js';
import type { ForgeMcpDeps, ToolContext } from '#/types/deps.types.js';
import type { ForgeToolSpec } from '#/types/tool-spec.types.js';

export const SERVER_NAME = 'forge';

function errorText(err: unknown): string {
  // ForgeError messages are written for the Worker; anything else may leak internals.
  return err instanceof ForgeError
    ? err.message
    : 'internal error in the forge MCP server';
}

/** Verifies the run token and that the run is active, then returns an unconnected server. */
export async function createForgeMcpServer(deps: ForgeMcpDeps): Promise<McpServer> {
  if (!(await deps.tokens.verify(deps.runId, deps.runToken)))
    throw new AuthError('run token does not match the run');
  try {
    await loadActiveRun(deps.storage, deps.runId);
  } catch (err) {
    if (err instanceof PolicyDeniedError) throw new AuthError(err.message);
    throw err;
  }

  const server = new McpServer(
    { name: SERVER_NAME, version: '0.0.0' },
    {
      instructions:
        'Forge tools for this run. Questions and blockers are recorded for the Director; stop working after ask_director or report_blocked.',
    },
  );
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => randomUUID().replaceAll('-', '').slice(0, 24));

  const register = (spec: ForgeToolSpec) => {
    server.registerTool(
      spec.name,
      {
        description: spec.description,
        inputSchema: spec.inputSchema,
        annotations: {
          readOnlyHint: spec.risk === 'read',
          openWorldHint: spec.risk === 'network',
          destructiveHint: false,
        },
      },
      async (args: unknown) => {
        try {
          const run = await loadActiveRun(deps.storage, deps.runId);
          const ctx: ToolContext = { deps, run, now, newId };
          const text = await spec.run(ctx, args);
          return { content: [{ type: 'text' as const, text }] };
        } catch (err) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: errorText(err) }],
          };
        }
      },
    );
  };
  FORGE_TOOLS.forEach(register);
  return server;
}
