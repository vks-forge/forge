/**
 * Entry point: composes the data source, providers and router, and mounts the app.
 *
 * Why: this is the only place that reads build-time flags and touches the DOM root; all other
 *   modules are pure over what they are given, so tests can compose the same app with fakes.
 *   `VITE_FORGE_API=mock` and `VITE_FORGE_MOCK=empty|error` exist for development and the
 *   Playwright smoke only; production behaviour is fixed by the adapter table.
 *
 * Exports: none (side effect: renders into #root).
 * Depends on: react, react-dom, react-router, api/compose-api, api/query-client,
 *   components/app-providers, routes/app-routes, theme/app.css. IO: the DOM.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { composeApi } from '#/api/compose-api.js';
import { createQueryClient } from '#/api/query-client.js';
import { AppProviders } from '#/components/app-providers.js';
import { appRoutes } from '#/routes/app-routes.js';
import '#/theme/app.css';

const { api, table } = composeApi({
  forceApi: import.meta.env['VITE_FORGE_API'],
  mockScenario: import.meta.env['VITE_FORGE_MOCK'],
});

const root = document.getElementById('root');
if (!root) {
  throw new Error('index.html has no #root element.');
}

createRoot(root).render(
  <StrictMode>
    <AppProviders api={api} table={table} queryClient={createQueryClient()}>
      <RouterProvider router={createBrowserRouter(appRoutes)} />
    </AppProviders>
  </StrictMode>,
);
