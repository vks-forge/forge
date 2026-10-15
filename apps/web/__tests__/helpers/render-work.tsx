/**
 * `renderWork()`: mounts the real app on a project URL with `fetch` stubbed.
 *
 * Why: Home, Inbox, Runs and Cost are tested against the server's HTTP surface (d-0123). This helper composes the same providers and route table as
 *   `main.tsx` over the real http adapter, with a `FetchStub` standing in for the server and a
 *   default `/projects` reply so the shell and project scope load. The test keeps the stub to
 *   change a route mid-test and to assert which calls the screen made.
 *
 * Exports: renderWork().
 * Depends on: react-router, @testing-library/react, @tanstack/react-query, app code,
 *   helpers/fetch-stub, helpers/work-fixtures, api/http/http-adapter.
 */

import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createHttpAdapter } from '#/api/http/http-adapter.js';
import { AppProviders } from '#/components/app-providers.js';
import { appRoutes } from '#/routes/app-routes.js';
import { stubFetch } from '#tests/helpers/fetch-stub.js';
import type { FetchStub, Routes } from '#tests/helpers/fetch-stub.js';
import { PROJECTS_REPLY } from '#tests/helpers/work-fixtures.js';

export function renderWork(
  path: string,
  routes: Routes = {},
): { stub: FetchStub; router: ReturnType<typeof createMemoryRouter> } {
  const stub = stubFetch({ 'GET /projects': { body: PROJECTS_REPLY }, ...routes });
  const api = createHttpAdapter({ baseUrl: '/api' });
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <AppProviders api={api} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return { stub, router };
}
