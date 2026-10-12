/**
 * forge-mcp — entry of the per-run `forge` MCP server process.
 *
 * Why: a driver launches this process for each run with FORGE_RUN_ID, FORGE_RUN_TOKEN
 *   and FORGE_DB_PATH (and optionally FORGE_SEARXNG_URL) in the environment; the harness
 *   then speaks MCP over stdin/stdout. It runs the compiled build (`pnpm build` first).
 *
 * Exports: none (executable).
 * Depends on: @forge/mcp, services/start.
 */

import { serveStdio } from '@forge/mcp';
import { start } from '#/services/start.js';

await start(process.env, {
  exit: (code) => process.exit(code),
  stderr: (message) => process.stderr.write(message),
  serve: serveStdio,
});
