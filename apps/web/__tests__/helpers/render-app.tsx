/**
 * `renderApp()`: mounts the real shell and routes with fixture data and a memory router.
 *
 * Why: tests should exercise the app users run, not a lookalike. This helper composes the same
 *   providers and the same route table as `main.tsx`, with the mock adapter at zero latency,
 *   and lets a test add extra routes (for example a view that reports unsaved edits) and pick a
 *   scenario (ok, empty, error) to drive the loading, empty and error states.
 *
 * Exports: renderApp(), DirtyView, locationOf().
 * Depends on: react, react-router, @testing-library/react, @tanstack/react-query,
 *   components/app-providers, api/compose-api, routes/app-routes, state/unsaved-changes.
 */

import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { NonIndexRouteObject, RouteObject } from 'react-router';
import { fakeTicketsFor } from '#tests/helpers/fake-tickets/fake-scenario.js';
import { composeApi } from '#/api/compose-api.js';
import { AppProviders } from '#/components/app-providers.js';
import { appRoutes } from '#/routes/app-routes.js';
import { useUnsavedChanges } from '#/state/unsaved-changes.js';
import type { ForgeApi, MockScenario } from '#/types/api.types.js';

/** A screen that always holds unsaved edits. */
export function DirtyView() {
  useUnsavedChanges(true);

  return <h1>Dirty form</h1>;
}

export function renderApp(
  options: {
    path?: string;
    scenario?: MockScenario;
    extraRoutes?: RouteObject[];
    /** Replace parts of the fixture API, for example to make one call fail. */
    wrapApi?: (api: ForgeApi) => ForgeApi;
  } = {},
): RenderResult & { router: ReturnType<typeof createMemoryRouter> } {
  const { api, table } = composeApi({
    forceApi: 'mock',
    mockScenario: options.scenario ?? 'ok',
    latencyMs: [0, 0],
  });

  const shell = appRoutes[0] as NonIndexRouteObject;
  const routes: RouteObject[] = [
    { ...shell, children: [...(options.extraRoutes ?? []), ...(shell.children ?? [])] },
  ];

  // Tickets, answers, intake and run streams come from a test-only fake: the app has no
  // fixture data for them (d-0123).
  const withTickets = { ...api, ...fakeTicketsFor(options.scenario) } as ForgeApi;
  const wrapped = options.wrapApi ? options.wrapApi(withTickets) : withTickets;
  const router = createMemoryRouter(routes, { initialEntries: [options.path ?? '/'] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <AppProviders api={wrapped} table={table} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return { ...view, router };
}

/** Current path of a router, for assertions. */
export function locationOf(router: {
  state: { location: { pathname: string } };
}): string {
  return router.state.location.pathname;
}
