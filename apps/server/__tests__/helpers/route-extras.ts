/**
 * Inert project registry, catalogue, compatibility service, ticket issuer and shutdown hook for route tests that do not touch them.
 *
 * Why: `RouteDeps` carries the project registry for the projects endpoints. Route tests about tickets, settings or run events must still
 *   build the whole dependency bag (it also carries the tool catalogue and the harness
 *   compatibility service); giving them inert ones keeps those tests about their own route
 *   instead of about wiring.
 *
 * Exports: inertRouteExtras().
 * Depends on: @forge/db (memory stores), services/auth/sse-tickets, services/harness-compat,
 *   types/routes. No IO.
 */

import { createMemoryCatalogueStore, createMemoryStorage } from '@forge/db';
import { createSseTicketIssuer } from '#/services/auth/sse-tickets.js';
import { createHarnessCompat } from '#/services/harness-compat.js';
import { createChatTrigger } from '@forge/triggers';
import { createTriggerRegistry } from '#/services/trigger-registry.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** A registry that serves nothing. */
export function inertRouteExtras(): Pick<
  RouteDeps,
  'projects' | 'catalogue' | 'compat' | 'triggers' | 'tickets' | 'requestShutdown'
> {
  const catalogue = createMemoryCatalogueStore();

  return {
    triggers: createTriggerRegistry([createChatTrigger()]),
    tickets: createSseTicketIssuer(() => Date.now()),
    requestShutdown: () => undefined,
    catalogue,
    compat: createHarnessCompat({
      storage: createMemoryStorage(),
      catalogue,
      port: undefined,
      supportKey: 'claude-code',
      now: () => 0,
      log: () => undefined,
    }),
    projects: {
      load: async () => undefined,
      register: async () => undefined,
      check: async () => undefined,
      archive: () => undefined,
      runtime: () => null,
      slugs: () => [],
    },
  };
}
