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

import { Navigate } from 'react-router';
import type { RouteObject } from 'react-router';
import { AppShell } from '#/components/shell/app-shell.js';
import { PROJECT_NAV, SETTINGS_NAV } from '#/domain/nav-entries.js';
import { NotFound } from '#/routes/not-found.js';
import { PlaceholderPage } from '#/routes/placeholder-page.js';
import { ProjectScope } from '#/routes/project-scope.js';
import { RootRedirect } from '#/routes/root-redirect.js';

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <RootRedirect /> },
      {
        path: 'p/:slug',
        element: <ProjectScope />,
        children: PROJECT_NAV.map((entry) =>
          entry.segment === ''
            ? { index: true, element: <PlaceholderPage entry={entry} inProject /> }
            : {
                path: entry.segment,
                element: <PlaceholderPage entry={entry} inProject />,
              },
        ),
      },
      {
        path: 'settings',
        children: [
          { index: true, element: <Navigate to="harnesses" replace /> },
          ...SETTINGS_NAV.map((entry) => ({
            path: entry.segment,
            element: <PlaceholderPage entry={entry} />,
          })),
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];
