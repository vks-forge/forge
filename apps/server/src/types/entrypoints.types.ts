/**
 * Types for the programs the server starts on behalf of a run.
 *
 * Why: the per-run MCP server and the hook script are found by path and handed to the
 *   harness; naming the pair keeps the resolver, the settings and the run preparation
 *   agreeing on what "the entry points" are.
 *
 * Exports: Entrypoints.
 * Depends on: none. Types only.
 */

export interface Entrypoints {
  /** Built entry of the per-run MCP server (`apps/mcp/dist/main.js`). */
  readonly mcpEntry: string;
  /** The script the harness runs on every tool event (`@forge/drivers` `bin/hook.js`). */
  readonly hookJsPath: string;
}
