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
 * Exports: appRoutes.
 * Depends on: react-router, components/shell/app-shell, domain/nav-entries, routes/*.
 */

import type { ReactNode } from 'react';
import type { RouteObject } from 'react-router';
import { AppShell } from '#/components/shell/app-shell.js';
import { PROJECT_NAV } from '#/domain/nav-entries.js';
import { BoardPage } from '#/routes/board/board-page.js';
import { MemoryPage } from '#/routes/memory/memory-page.js';
import { NotFound } from '#/routes/not-found.js';
import { PlaceholderPage } from '#/routes/placeholder-page.js';
import { ProjectSettingsPage } from '#/routes/project-settings/project-settings-page.js';
import { ProjectScope } from '#/routes/project-scope.js';
import { RootRedirect } from '#/routes/root-redirect.js';
import { settingsRoutes } from '#/routes/settings/settings-routes.js';
import { TicketPage } from '#/routes/ticket/ticket-page.js';

/** Project screens that are built; any segment not listed here still shows its placeholder. */
const PROJECT_SCREENS: Readonly<Record<string, ReactNode>> = {
  board: <BoardPage />,
  memory: <MemoryPage />,
  settings: <ProjectSettingsPage />,
};

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <RootRedirect /> },
      {
        path: 'p/:slug',
        element: <ProjectScope />,
        children: [
          { path: 'tickets/:id', element: <TicketPage /> },
          ...PROJECT_NAV.map((entry) =>
            entry.segment === ''
              ? { index: true, element: <PlaceholderPage entry={entry} inProject /> }
              : {
                  path: entry.segment,
                  element: PROJECT_SCREENS[entry.segment] ?? (
                    <PlaceholderPage entry={entry} inProject />
                  ),
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
];
