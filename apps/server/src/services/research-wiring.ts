/**
 * Research wiring: the live research provider the engine uses, built from the saved settings.
 *
 * Why: where Forge searches is configuration the owner edits in the UI and stores in the database (code.md
 *   rule 9, d-0085); the Director's research step must follow a change without a restart, and the settings
 *   page needs a Test button that tries a provider before it is saved. This hands the engine one provider
 *   that delegates to a real one built from the company's research settings and rebuilt when their version
 *   changes (the same rule project runtimes follow), and exposes `test()` and `refresh()` to the routes.
 *   The network ports are injected, so tests prove it with no network. A settings read that fails keeps the
 *   provider that already works rather than taking research down.
 *
 * Exports: createResearchWiring(), buildResearchWiring().
 * Depends on: @forge/core (BUILTIN_FORGE_CONFIG, ConfigSource, ResearchProvider), @forge/research,
 *   types/research. IO: reads settings; the providers open sockets only when called.
 */

import { BUILTIN_FORGE_CONFIG } from '@forge/core';
import type { ConfigSource, ResearchProvider, ResearchSettings } from '@forge/core';
import { createResearchProvider } from '@forge/research';
import type { NetworkPorts } from '@forge/research';
import type { ResearchWiring } from '#/types/research.types.js';

/** The wiring over `config`; `net` replaces the production network ports (tests). */
export function buildResearchWiring(
  config: ConfigSource,
  net?: NetworkPorts,
): ResearchWiring {
  let current: ResearchProvider = createResearchProvider(
    BUILTIN_FORGE_CONFIG.research,
    net,
  );

  let version = -1;

  async function refresh(): Promise<void> {
    try {
      const view = await config.company();
      if (view.version !== version) {
        current = createResearchProvider(view.config.research, net);
        version = view.version;
      }
    } catch {
      // Keep the provider that works; the next call tries again.
    }
  }

  const provider: ResearchProvider = {
    capabilities: () => current.capabilities(),
    async search(query, opts) {
      await refresh();

      return current.search(query, opts);
    },
    async fetch(url, opts) {
      await refresh();

      return current.fetch(url, opts);
    },
    async health() {
      await refresh();

      return current.health();
    },
  };

  return {
    provider,
    refresh,
    async test(settings?: ResearchSettings) {
      const s = settings ?? (await config.company()).config.research;
      const res = await createResearchProvider(s, net).health();

      return res.ok
        ? { ok: true, provider: s.provider, latency_ms: res.value.latency_ms }
        : { ok: false, provider: s.provider, error: res.error };
    },
  };
}

/** The wiring, already following the saved settings: the one place the server starts it. */
export async function createResearchWiring(
  config: ConfigSource,
  net?: NetworkPorts,
): Promise<ResearchWiring> {
  const wiring = buildResearchWiring(config, net);
  await wiring.refresh();

  return wiring;
}
