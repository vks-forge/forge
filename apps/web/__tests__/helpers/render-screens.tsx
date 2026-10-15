/**
 * `renderScreens()`: mounts the memory and project-settings screens over the stubbed server
 * and hands back the API, so a test can change the "server" behind the screen's back.
 *
 * Why: the hard cases on these screens are about the server moving while the user is looking:
 *   another tab saves settings first (409), a proposal is answered elsewhere, a write fails.
 *   Tests need an API on the same stub the screen uses to stage that, and `routes` to stage a
 *   refusal. The helper uses the real providers, the real http adapter and the real screens,
 *   with no shell around them; the company settings behind it are the ones the project
 *   screen inherits from.
 *
 * Exports: renderScreens().
 * Depends on: react-router, @testing-library/react, @tanstack/react-query, app code,
 *   helpers/fake-forge.
 */

import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppProviders } from '#/components/app-providers.js';
import { MemoryPage } from '#/routes/memory/memory-page.js';
import { ProjectSettingsPage } from '#/routes/project-settings/project-settings-page.js';
import type { ForgeApi } from '#/types/api.types.js';
import { installFakeForge } from '#tests/helpers/fake-forge/fake-forge.js';
import type { FakeForge } from '#tests/helpers/fake-forge/fake-forge.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';
import { companyVersionsForProjects } from '#tests/helpers/forge-data/project-settings-data.js';

export function renderScreens(
  path: string,
  options: { routes?: Routes } = {},
): RenderResult & {
  api: ForgeApi;
  forge: FakeForge;
  router: ReturnType<typeof createMemoryRouter>;
} {
  const forge = installFakeForge({
    companyHistory: companyVersionsForProjects(),
    ...(options.routes ? { routes: options.routes } : {}),
  });

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
    <AppProviders api={forge.api} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return { ...view, api: forge.api, forge, router };
}
