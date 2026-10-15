/**
 * Public API of @forge/mcp — re-exports only.
 *
 * Why: apps/mcp (the `forge-mcp` process) must build the `forge` MCP server from ports
 *   (storage, SearXNG URL) and serve it on stdio, and the driver must
 *   compare a live `tools/list` to the catalogue. This surface is exactly that;
 *   the tools themselves stay internal behind the server.
 *
 * Exports: createForgeMcpServer, SERVER_NAME, FORGE_TOOLS, serveStdio, withDefaultNetwork, hashToken,
 *   verifyRunToken, toolSchemaHash, computeToolSchemaHashes, Claim,
 *   and the dependency types.
 * Depends on: every module under src/, @forge/core (Claim re-export). No IO on import.
 */

export * from '#/adapters/default-network.js';
export * from '#/adapters/stdio.js';
export * from '#/domain/run-tokens.js';
export * from '#/domain/schema-hash.js';
export * from '#/domain/server.js';
export * from '#/domain/tools/all-tools.js';
export { Claim } from '@forge/core';
export type * from '#/types/deps.types.js';
export type * from '#/types/ssrf.types.js';
export type * from '#/types/tool-spec.types.js';
