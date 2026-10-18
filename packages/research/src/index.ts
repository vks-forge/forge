/**
 * Public API of @forge/research — re-exports only.
 *
 * Why: the app composes the research provider from settings and hands it to the engine (the
 *   Director's research step) and to the MCP server (a Worker's `web_search` and `web_fetch`); neither
 *   may import this package's internals, and neither may open a socket to the web itself.
 *
 * Exports: createResearchProvider, ProviderFactories, nodeNetwork, createSearxngProvider, createNoneProvider,
 *   validateSearxngBase, guardedFetchText, toResearchError, NOT_CONFIGURED_MESSAGE, and the network types.
 * Depends on: every module under src/. No IO on import.
 */

export * from '#/adapters/node-network/node-network.js';
export * from '#/adapters/none/none-provider.js';
export * from '#/adapters/searxng/searxng-provider.js';
export * from '#/adapters/searxng/validate-base.js';
export * from '#/domain/create-research-provider.js';
export * from '#/shared/guarded-fetch.js';
export * from '#/shared/research-errors.js';
export type * from '#/types/network.types.js';
