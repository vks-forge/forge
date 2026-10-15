/**
 * `renderApp()`: mounts the real shell and routes over a stubbed Forge server and a memory router.
 *
 * Why: tests should exercise the app users run, not a lookalike. This helper composes the same
 *   providers, the same route table and the same http adapter as `main.tsx`; only `fetch` is
 *   stubbed (d-0123), with sample projects, settings, memory and tickets behind it. A test can
 *   add extra routes to the app (for example a view that reports unsaved edits), pick a
 *   scenario (ok, empty, error) to drive the loading, empty and error states, and stage a
 *   refusal or a dead call by passing `routes` that win over the sample ones.
 *
 * Exports: renderApp(), DirtyView, locationOf(), RenderAppOptions.
 * Depends on: react, react-router, @testing-library/react, @tanstack/react-query,
 *   components/app-providers, routes/app-routes, state/unsaved-changes, helpers/fake-forge.
 */

import type { ConfigVersion } from '@forge/core';
import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { NonIndexRouteObject, RouteObject } from 'react-router';
import { AppProviders } from '#/components/app-providers.js';
import { appRoutes } from '#/routes/app-routes.js';
import { useUnsavedChanges } from '#/state/unsaved-changes.js';
import { installFakeForge } from '#tests/helpers/fake-forge/fake-forge.js';
import type { FakeForge, Scenario } from '#tests/helpers/fake-forge/fake-forge.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';

/** A screen that always holds unsaved edits. */
export function DirtyView() {
  useUnsavedChanges(true);

  return <h1>Dirty form</h1>;
}

export interface RenderAppOptions {
  path?: string;
  scenario?: Scenario;
  extraRoutes?: RouteObject[];
  /** Stub routes that win over the sample server's, to stage a refusal or a dead call. */
  routes?: Routes;
  companyHistory?: readonly ConfigVersion[];
}

export function renderApp(
  options: RenderAppOptions = {},
): RenderResult & { router: ReturnType<typeof createMemoryRouter>; forge: FakeForge } {
  const forge = installFakeForge({
    ...(options.scenario ? { scenario: options.scenario } : {}),
    ...(options.routes ? { routes: options.routes } : {}),
    ...(options.companyHistory ? { companyHistory: options.companyHistory } : {}),
  });

  const shell = appRoutes[0] as NonIndexRouteObject;
  const routes: RouteObject[] = [
    { ...shell, children: [...(options.extraRoutes ?? []), ...(shell.children ?? [])] },
  ];

  const router = createMemoryRouter(routes, { initialEntries: [options.path ?? '/'] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <AppProviders api={forge.api} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return { ...view, router, forge };
}

/** Current path of a router, for assertions. */
export function locationOf(router: {
  state: { location: { pathname: string } };
}): string {
  return router.state.location.pathname;
}
