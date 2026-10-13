/**
 * Default network wiring for the Forge MCP server.
 *
 * Why: the `domain/` layer must not choose real sockets or a real resolver, or tests and
 *   other hosts could not substitute them and a missing port would silently fall back to
 *   the ambient network. The composition root (`apps/mcp`) calls this once to fill in
 *   the production DNS resolver, the address-pinned HTTP transport and `fetch` for
 *   SearXNG; anything the caller already supplied is kept.
 *
 * Exports: withDefaultNetwork().
 * Depends on: adapters/node-transport, adapters/system-dns, types/deps.types. IO: none until a tool runs.
 */

import { nodeTransport } from '#/adapters/node-transport.js';
import { systemResolve } from '#/adapters/system-dns.js';
import type { ForgeMcpDeps } from '#/types/deps.types.js';

/** Returns `deps` with the production resolver, transport and search fetch filled in. */
export function withDefaultNetwork(deps: ForgeMcpDeps): ForgeMcpDeps {
  return {
    ...deps,
    resolve: deps.resolve ?? systemResolve,
    transport: deps.transport ?? nodeTransport,
    searchFetch: deps.searchFetch ?? fetch,
  };
}
