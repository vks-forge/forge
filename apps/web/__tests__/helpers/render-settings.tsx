/**
 * `renderSettings()`: mounts the real app on a Forge settings URL and hands back the fixture API.
 *
 * Why: settings tests are about writes (a save, a conflict, a stored key), and a conflict can
 *   only be staged by a second writer. Returning the same mock `ForgeApi` the screens use lets
 *   a test play that second writer (save a version behind the page's back) and then assert
 *   what the page does. Everything else is the shipped providers and route table, with the
 *   mock adapter at zero latency.
 *
 * Exports: renderSettings().
 * Depends on: react-router, @testing-library/react, @tanstack/react-query,
 *   components/app-providers, api/compose-api, routes/app-routes.
 */

import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { composeApi } from '#/api/compose-api.js';
import { AppProviders } from '#/components/app-providers.js';
import { appRoutes } from '#/routes/app-routes.js';
import type { ForgeApi, MockScenario } from '#/types/api.types.js';

export function renderSettings(
  path: string,
  options: { scenario?: MockScenario } = {},
): { api: ForgeApi; router: ReturnType<typeof createMemoryRouter> } {
  const { api, table } = composeApi({
    forceApi: 'mock',
    mockScenario: options.scenario ?? 'ok',
    latencyMs: [0, 0],
  });

  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <AppProviders api={api} table={table} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return { api, router };
}
