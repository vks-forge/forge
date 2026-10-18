/**
 * createResearchProvider — builds the provider the settings name.
 *
 * Why: which search backend Forge uses is configuration the owner edits (code.md rule 9, d-0085), and
 *   adding a backend must be a new folder and one entry here, never an edit in the engine or the MCP
 *   server (code.md rule 2). The provider is chosen by a map keyed by the settings value, not by a chain
 *   of `if`s, so an unknown value is a compile error. Production network ports are created only for a
 *   provider that needs them.
 *
 * Exports: createResearchProvider(), ProviderFactories.
 * Depends on: @forge/core, adapters/searxng, adapters/none, adapters/node-network, types/network.types.
 *   No IO until a provider is called.
 */

import type { ResearchProvider, ResearchProviderId, ResearchSettings } from '@forge/core';
import { nodeNetwork } from '#/adapters/node-network/node-network.js';
import { createNoneProvider } from '#/adapters/none/none-provider.js';
import { createSearxngProvider } from '#/adapters/searxng/searxng-provider.js';
import type { NetworkPorts } from '#/types/network.types.js';

/** One factory per provider id; the compiler demands an entry for every `ResearchProviderId`. */
export const ProviderFactories: Record<
  ResearchProviderId,
  (s: ResearchSettings, net: NetworkPorts | undefined, now: () => Date) => ResearchProvider
> = {
  searxng: (s, net, now) => createSearxngProvider(s, net ?? nodeNetwork(), now),
  none: () => createNoneProvider(),
};

/** The provider for `settings`; `net` and `now` are injected by tests. */
export function createResearchProvider(
  settings: ResearchSettings,
  net?: NetworkPorts,
  now: () => Date = () => new Date(),
): ResearchProvider {
  return ProviderFactories[settings.provider](settings, net, now);
}
