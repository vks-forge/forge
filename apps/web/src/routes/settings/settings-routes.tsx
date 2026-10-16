/**
 * The route table of the Forge settings area (`/settings/*`).
 *
 * Why: Harnesses, GitHub, Limits, Director and General are Forge-wide, outside any project (d-0104);
 *   keeping their routes in one file lets the main route table take them as a block and
 *   keeps batch W2 from editing it beyond one line. A harness has its own page under
 *   `/settings/harnesses/:id`.
 *
 * Exports: settingsRoutes.
 * Depends on: react-router, routes/settings/*.
 */

import { Navigate } from 'react-router';
import type { RouteObject } from 'react-router';
import { DirectorPage } from '#/routes/settings/director-page.js';
import { GeneralPage } from '#/routes/settings/general-page.js';
import { GithubPage } from '#/routes/settings/github-page.js';
import { HarnessDetailPage } from '#/routes/settings/harness-detail-page.js';
import { HarnessesPage } from '#/routes/settings/harnesses-page.js';
import { LimitsPage } from '#/routes/settings/limits-page.js';

export const settingsRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="harnesses" replace /> },
  { path: 'harnesses', element: <HarnessesPage /> },
  { path: 'harnesses/:id', element: <HarnessDetailPage /> },
  { path: 'github', element: <GithubPage /> },
  { path: 'limits', element: <LimitsPage /> },
  { path: 'director', element: <DirectorPage /> },
  { path: 'general', element: <GeneralPage /> },
];
