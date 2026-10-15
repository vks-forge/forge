/**
 * `renderScreens()`: mounts the memory and project-settings screens on the mock adapter and
 * hands back the API, so a test can change the "server" behind the screen's back.
 *
 * Why: the hard cases on these screens are about the server moving while the user is looking:
 *   another tab saves settings first (409), a proposal is answered elsewhere, a write fails.
 *   Tests need the same `ForgeApi` the screen uses to stage that. The helper uses the real
 *   providers and the real screens, with no shell around them, at zero latency.
 *
 * Exports: renderScreens().
 * Depends on: react-router, @testing-library/react, @tanstack/react-query, app code.
 */

import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { composeApi } from '#/api/compose-api.js';
import { AppProviders } from '#/components/app-providers.js';
import { MemoryPage } from '#/routes/memory/memory-page.js';
import { ProjectSettingsPage } from '#/routes/project-settings/project-settings-page.js';
import type { ForgeApi } from '#/types/api.types.js';

export function renderScreens(
  path: string,
  tweak: (api: ForgeApi) => ForgeApi = (api) => api,
): RenderResult & { api: ForgeApi; router: ReturnType<typeof createMemoryRouter> } {
  const composed = composeApi({ forceApi: 'mock', latencyMs: [0, 0] });
  const api = tweak(composed.api);
  const router = createMemoryRouter(
    [
      { path: '/p/:slug/memory', element: <MemoryPage /> },
      { path: '/p/:slug/settings', element: <ProjectSettingsPage /> },
      { path: '*', element: <p>elsewhere</p> },
    ],
    { initialEntries: [path] },
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <AppProviders api={api} table={composed.table} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return { ...view, api, router };
}
