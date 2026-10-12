/**
 * Public API of @forge/mcp — re-exports only.
 *
 * Why: apps/mcp (the `forge-mcp` process) must build the `forge` MCP server from ports
 *   (storage, run-token store, SearXNG URL) and serve it on stdio, and the driver must
 *   compare a live `tools/list` to the signed catalogue. This surface is exactly that;
 *   the tools themselves stay internal behind the server.
 *
 * Exports: createForgeMcpServer, SERVER_NAME, FORGE_TOOLS, serveStdio, createRunTokenAuthority,
 *   createMemoryTokenStore, hashToken, toolSchemaHash, computeToolSchemaHashes,
 *   DEV_CATALOGUE_KEY, Claim, and the dependency/port types.
 * Depends on: every module under src/. No IO on import.
 */

export * from '#/adapters/stdio.js';
export * from '#/domain/catalogue-key.js';
export * from '#/domain/run-tokens.js';
export * from '#/domain/schema-hash.js';
export * from '#/domain/server.js';
export * from '#/domain/tools/all-tools.js';
export * from '#/schemas/claims.js';
export type * from '#/types/deps.types.js';
export type * from '#/types/ports/run-token-store.types.js';
export type * from '#/types/ssrf.types.js';
export type * from '#/types/tool-spec.types.js';
