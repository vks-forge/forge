/**
 * Entry point: composes the data source, providers and router, and mounts the app.
 *
 * Why: this is the only place that creates the http adapter and touches the DOM root; all
 *   other modules are pure over what they are given, so tests compose the same app over a
 *   stubbed `fetch`. The page calls `/api/*` with no credentials: the dev and preview proxy
 *   adds the install token server-side (vite.forge-proxy.ts, d-0093).
 *
 * Exports: none (side effect: renders into #root).
 * Depends on: react, react-dom, react-router, api/http/http-adapter, api/query-client,
 *   components/app-providers, routes/app-routes, theme/app.css. IO: the DOM.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { createHttpAdapter } from '#/api/http/http-adapter.js';
import { createQueryClient } from '#/api/query-client.js';
import { AppProviders } from '#/components/app-providers.js';
import { appRoutes } from '#/routes/app-routes.js';
import '#/theme/app.css';

const api = createHttpAdapter({ baseUrl: '/api' });

const root = document.getElementById('root');
if (!root) {
  throw new Error('index.html has no #root element.');
}

createRoot(root).render(
  <StrictMode>
    <AppProviders api={api} queryClient={createQueryClient()}>
      <RouterProvider router={createBrowserRouter(appRoutes)} />
    </AppProviders>
  </StrictMode>,
);
