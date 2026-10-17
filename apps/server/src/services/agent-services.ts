/**
 * The agent services of one server: store, readiness, tester and drafter, built once.
 *
 * Why: the agent routes are split over two files (company and project) but must share one
 *   tester, whose in-flight guard is what stops two clicks spending twice on one harness. They
 *   are built from the route dependencies the server already has plus the two ports the app
 *   hands in (drivers and the Director model), memoized per dependency bag so every route file
 *   sees the same instances. This is wiring only; the rules live in the services.
 *
 * Exports: agentServices().
 * Depends on: services/agent-{store,readiness,test,draft}, types/routes, types/agent-store. No IO.
 */

import { createAgentDrafter } from '#/services/agent-draft.js';
import { createAgentReadiness } from '#/services/agent-readiness.js';
import { createAgentStore } from '#/services/agent-store.js';
import { createAgentTester } from '#/services/agent-test.js';
import type { AgentDeps, AgentServices } from '#/types/agent-store.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

const cache = new WeakMap<RouteDeps, AgentServices>();

/** The agent services for `deps`; the same instances on every call with the same bag. */
export function agentServices(deps: RouteDeps): AgentServices {
  const cached = cache.get(deps);
  if (cached) {
    return cached;
  }

  const agentDeps: AgentDeps = {
    config: deps.config,
    storage: deps.storage,
    catalogue: deps.catalogue,
    compat: deps.compat,
    now: deps.now,
    ports: deps.agentPorts,
  };

  const store = createAgentStore(agentDeps);
  const built: AgentServices = {
    store,
    readiness: createAgentReadiness(agentDeps),
    test: createAgentTester(agentDeps),
    draft: createAgentDrafter(agentDeps, store),
  };

  cache.set(deps, built);

  return built;
}
