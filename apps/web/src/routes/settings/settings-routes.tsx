/**
 * The route table of the Forge settings area (`/settings/*`).
 *
 * Why: Harnesses, GitHub, Limits, Director, Agents, Pipelines and General are Forge-wide, outside any project (d-0104);
 *   keeping their routes in one file lets the main route table take them as a block and
 *   keeps batch W2 from editing it beyond one line. A harness has its own page under
 *   `/settings/harnesses/:id`.
 *
 * Exports: settingsRoutes.
 * Depends on: react-router, routes/settings/*. The tab list frames every child (forge-settings-layout).
 */

import { Navigate } from 'react-router';
import type { RouteObject } from 'react-router';
import { ForgeSettingsLayout } from '#/routes/settings/forge-settings-layout.js';
import { AgentsPage } from '#/routes/settings/agents-page.js';
import { DirectorPage } from '#/routes/settings/director-page.js';
import { GeneralPage } from '#/routes/settings/general-page.js';
import { GithubPage } from '#/routes/settings/github-page.js';
import { HarnessDetailPage } from '#/routes/settings/harness-detail-page.js';
import { HarnessesPage } from '#/routes/settings/harnesses-page.js';
import { PipelinesPage } from '#/routes/settings/pipelines-page.js';
import { LimitsPage } from '#/routes/settings/limits-page.js';

export const settingsRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="harnesses" replace /> },
  {
    element: <ForgeSettingsLayout />,
    children: [
      { path: 'general', element: <GeneralPage /> },
      { path: 'director', element: <DirectorPage /> },
      { path: 'agents', element: <AgentsPage /> },
      { path: 'pipelines', element: <PipelinesPage /> },
      { path: 'limits', element: <LimitsPage /> },
      { path: 'harnesses', element: <HarnessesPage /> },
      { path: 'harnesses/:id', element: <HarnessDetailPage /> },
      { path: 'github', element: <GithubPage /> },
    ],
  },
];
