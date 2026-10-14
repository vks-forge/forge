/**
 * Inert project registry and secret store for route tests that do not touch projects.
 *
 * Why: `RouteDeps` carries the project registry for the projects endpoints. Route tests about tickets, settings or run events must still
 *   build the whole dependency bag; giving them one inert pair keeps those tests about
 *   their own route instead of about registry wiring.
 *
 * Exports: inertRouteExtras().
 * Depends on: types/routes. No IO.
 */

import type { RouteDeps } from '#/types/routes.types.js';

/** A registry that serves nothing. */
export function inertRouteExtras(): Pick<RouteDeps, 'projects'> {
  return {
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
