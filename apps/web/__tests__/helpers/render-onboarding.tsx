/**
 * `renderOnboarding()`: mounts the real app routes over a stubbed `fetch`, for first-run tests.
 *
 * Why: the wizard and the new-project form are about the order of server calls (system, then
 *   inspect, then create) and about what each refusal looks like on screen. Running the shipped
 *   providers, route table and http adapter against a table of stubbed answers tests exactly
 *   that, with no fixture data and no server. Each call is recorded by the `FetchStub`.
 *
 * Exports: renderOnboarding(), SYSTEM_FRESH, projectReply().
 * Depends on: react-router, @testing-library/react, @tanstack/react-query, components/app-providers,
 *   api/http/http-adapter, routes/app-routes, helpers/fetch-stub.
 */

import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createHttpAdapter } from '#/api/http/http-adapter.js';
import { AppProviders } from '#/components/app-providers.js';
import { appRoutes } from '#/routes/app-routes.js';
import { stubFetch } from '#tests/helpers/fetch-stub.js';
import type { FetchStub, Routes } from '#tests/helpers/fetch-stub.js';

/** `GET /system` of a Forge that has just been installed. */
export const SYSTEM_FRESH = {
  service: 'forge',
  version: '0.0.0',
  data_home: 'C:\\Users\\me\\AppData\\Local\\Forge',
  first_run: { complete: false, project_count: 0, harness_ok: false },
};

/** A project row as `GET /projects` and `POST /projects` return it. */
export function projectReply(slug: string, prefix: string) {
  return {
    id: slug,
    slug,
    prefix,
    local_path: `C:\\code\\${slug}`,
    status: 'ready',
    ecosystems: [],
  };
}

export function renderOnboarding(
  path: string,
  routes: Routes,
): FetchStub & { router: ReturnType<typeof createMemoryRouter> } {
  const stub = stubFetch(routes);
  const api = createHttpAdapter({ baseUrl: '/api' });
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <AppProviders api={api} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return { ...stub, router };
}
