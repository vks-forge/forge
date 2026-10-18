/**
 * The route table of the control room.
 *
 * Why: one table says which URL shows which screen. To add a screen: give its entry to
 *   `PROJECT_NAV` or `SETTINGS_NAV` (domain/nav-entries.ts), build its component under
 *   `routes/`, and replace that entry's `PlaceholderPage` here. Project screens sit under
 *   `/p/:slug` behind `ProjectScope`; Forge-wide settings sit under `/settings`, outside any
 *   project (d-0104). Everything renders inside `AppShell`. Tests build their own router from
 *   these same routes plus extras, so what they exercise is what ships.
 *
 * Exports: appRoutes. `/welcome` (first-run wizard) sits outside the shell; `/projects/new` inside it.
 * Depends on: react-router, components/shell/app-shell, domain/nav-entries, routes/*.
 */

import type { ReactNode } from 'react';
import type { RouteObject } from 'react-router';
import { AppShell } from '#/components/shell/app-shell.js';
import { PROJECT_NAV } from '#/domain/nav-entries.js';
import { CardPage } from '#/routes/card/card-page.js';
import { BoardPage } from '#/routes/board/board-page.js';
import { CostPage } from '#/routes/cost/cost-page.js';
import { HomePage } from '#/routes/home/home-page.js';
import { InboxPage } from '#/routes/inbox/inbox-page.js';
import { MemoryPage } from '#/routes/memory/memory-page.js';
import { RecordPage } from '#/routes/memory/record-page.js';
import { NotFound } from '#/routes/not-found.js';
import { PlaceholderPage } from '#/routes/placeholder-page.js';
import { ProjectSettingsPage } from '#/routes/project-settings/project-settings-page.js';
import { projectSettingsRoutes } from '#/routes/project-settings/project-settings-routes.js';
import { ProjectScope } from '#/routes/project-scope.js';
import { OverviewPage } from '#/routes/overview/overview-page.js';
import { RunsPage } from '#/routes/runs/runs-page.js';
import { settingsRoutes } from '#/routes/settings/settings-routes.js';
import { NewProjectPage } from '#/routes/projects/new-project-page.js';
import { TicketsPage } from '#/routes/tickets/tickets-page.js';
import { TicketPage } from '#/routes/ticket/ticket-page.js';
import { WelcomePage } from '#/routes/welcome/welcome-page.js';

/** Project screens that are built; any segment not listed here still shows its placeholder. */
const PROJECT_SCREENS: Readonly<Record<string, ReactNode>> = {
  board: <BoardPage />,
  cost: <CostPage />,
  inbox: <InboxPage />,
  memory: <MemoryPage />,
  runs: <RunsPage />,
  settings: <ProjectSettingsPage />,
  tickets: <TicketsPage />,
};

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'projects/new', element: <NewProjectPage /> },
      {
        path: 'p/:slug',
        element: <ProjectScope />,
        children: [
          { path: 'tickets/:id/:tab?', element: <TicketPage /> },
          { path: 'cards/:id/:tab?', element: <CardPage /> },
          { path: 'memory/:id', element: <RecordPage /> },
          ...PROJECT_NAV.map((entry) =>
            entry.segment === ''
              ? { index: true, element: <HomePage /> }
              : {
                  path: entry.segment,
                  element: PROJECT_SCREENS[entry.segment] ?? (
                    <PlaceholderPage entry={entry} inProject />
                  ),
                  ...(entry.segment === 'settings'
                    ? { children: projectSettingsRoutes }
                    : {}),
                },
          ),
        ],
      },
      {
        path: 'settings',
        children: settingsRoutes,
      },
      { path: '*', element: <NotFound /> },
    ],
  },
  // First run is full screen: no project exists yet, so no shell. Kept after the shell so
  // tests that take `appRoutes[0]` as the shell still get it.
  { path: '/welcome', element: <WelcomePage /> },
];
