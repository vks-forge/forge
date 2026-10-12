/**
 * Serves an MCP server over the process's stdin/stdout.
 *
 * Why: a harness launches the Forge server as a child process and speaks MCP over its
 *   stdio. Keeping the transport here means the composition root needs no MCP SDK
 *   knowledge, and the server stays testable in memory.
 *
 * Exports: serveStdio().
 * Depends on: @modelcontextprotocol/sdk. IO: stdin/stdout.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

/** Connects `server` to stdio; resolves once the transport is up. */
export async function serveStdio(server: McpServer): Promise<void> {
  await server.connect(new StdioServerTransport());
}
