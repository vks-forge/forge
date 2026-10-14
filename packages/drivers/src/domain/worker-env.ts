/**
 * Environment variables every Worker session must run with, whatever the host sets.
 *
 * Why: Claude Code defers MCP tool schemas behind its own `ToolSearch` tool, so a Worker
 *   sees `mcp__forge__finish` by name only and must call ToolSearch to learn its
 *   arguments. Forge denies ToolSearch (it is not in the catalogue), so the Worker either
 *   guesses the schema, calls `finish` with a placeholder and no claims, or cannot call it
 *   at all, and gate G1 then rejects the run (probe 8, 2026-10-14). `ENABLE_TOOL_SEARCH=false`
 *   selects the "standard" mode of the bundled Claude Code 2.1.293, where every tool schema
 *   is in context from turn one and ToolSearch is not offered (RESULTS.md, probe 8 notes).
 *   The value is set in the process env and in the per-run settings `env` block, because
 *   Claude Code applies settings `env` after the process env and a user-level setting must
 *   not turn deferral back on.
 *
 * Exports: WORKER_HARNESS_ENV.
 * Depends on: none. No IO.
 */

/** Names and values forced onto every Worker harness session. */
export const WORKER_HARNESS_ENV: Readonly<Record<string, string>> = {
  ENABLE_TOOL_SEARCH: 'false',
};
