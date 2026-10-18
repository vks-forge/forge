/**
 * Production network wiring for the research providers.
 *
 * Why: the SSRF guard and the providers must not choose real sockets themselves, or tests and other hosts
 *   could not substitute them and a missing port would silently fall back to the ambient network. The
 *   factory calls this once, only for a provider that needs the network, to get the production DNS
 *   resolver, the address-pinned HTTP transport and the platform `fetch`.
 *
 * Exports: nodeNetwork().
 * Depends on: adapters/node-network/node-transport, adapters/node-network/system-dns, types/network.types.
 *   IO: none until a call is made.
 */

import { nodeTransport } from '#/adapters/node-network/node-transport.js';
import { systemResolve } from '#/adapters/node-network/system-dns.js';
import type { NetworkPorts } from '#/types/network.types.js';

/** The production resolver, transport and `fetch`. */
export function nodeNetwork(): NetworkPorts {
  return { resolve: systemResolve, transport: nodeTransport, fetch };
}
