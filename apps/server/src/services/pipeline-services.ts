/**
 * The pipeline store of one server, built once.
 *
 * Why: the pipeline routes are split over two files (company and project) and both need the same
 *   store. It is built from the route dependencies the server already has and memoized per
 *   dependency bag, so every route file sees the same instance. This is wiring only; the rules
 *   live in the store.
 *
 * Exports: pipelineStoreFor().
 * Depends on: services/pipeline-store, types/routes, types/agent-store. No IO.
 */

import { createPipelineStore } from '#/services/pipeline-store.js';
import type { AgentDeps } from '#/types/agent-store.types.js';
import type { PipelineStore } from '#/types/pipeline-store.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

const cache = new WeakMap<RouteDeps, PipelineStore>();

/** The pipeline store for `deps`; the same instance on every call with the same bag. */
export function pipelineStoreFor(deps: RouteDeps): PipelineStore {
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

  const built = createPipelineStore(agentDeps);
  cache.set(deps, built);

  return built;
}
