/**
 * Fixtures for the folder browser tests: a small fake disk and the helpers that open the browser.
 *
 * Why: the browser's behaviours (walking, sorting, making a folder, the right-click menu) all
 *   start from the same place: the in-app browser opened over the add-project dialog and walked
 *   into a home folder holding a few folders. One fake disk keeps those tests short and consistent.
 *
 * Exports: ROOTS, HOME_ENTRIES, entry(), home(), ABOVE_HOME, ROUTES, openBrowser(), intoHome(), names().
 * Depends on: @testing-library/react, @testing-library/user-event, helpers/fetch-stub, helpers/onboarding-fixtures.
 */

import { screen, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';
import { BASE_ROUTES } from '#tests/helpers/onboarding-fixtures.js';

export const ROOTS = {
  path: '',
  parent: null,
  entries: [
    { name: 'Home', path: '/home/me', is_repo: false, modified_at: null },
    { name: '/', path: '/', is_repo: false, modified_at: null },
  ],
  truncated: false,
};

export const entry = (name: string, modified_at: string, is_repo = false) => ({
  name,
  path: `/home/me/${name}`,
  is_repo,
  modified_at,
});

export const HOME_ENTRIES = [
  entry('billing', '2026-01-10T10:00:00.000Z', true),
  entry('notes', '2026-03-01T10:00:00.000Z'),
  entry('archive', '2025-06-01T10:00:00.000Z'),
];

export const home = (entries = HOME_ENTRIES) => ({
  path: '/home/me',
  parent: '/home',
  entries,
  truncated: false,
});

export const ABOVE_HOME = {
  path: '/home',
  parent: '/',
  entries: [{ name: 'me', path: '/home/me', is_repo: false, modified_at: null }],
  truncated: false,
};

export const ROUTES: Routes = {
  ...BASE_ROUTES,
  'POST /fs/pick-folder': json({ status: 'unavailable', reason: 'test desktop' }),
  'GET /fs/folders': ({ query }) => {
    const path = query.get('path');

    if (!path) {
      return json(ROOTS);
    }

    if (path === '/home/me') {
      return json(home());
    }

    return path === '/home' ? json(ABOVE_HOME) : refusal(404, 'folder_not_found');
  },
};

export type User = ReturnType<typeof userEvent.setup>;

export async function openBrowser(user: User) {
  await user.click(await screen.findByRole('button', { name: /Choose a folder/ }));

  return screen.findByRole('dialog', { name: 'Choose a folder' });
}

/** Opens the browser and walks into the home folder with the keyboard. */
export async function intoHome(user: User) {
  const dialog = await openBrowser(user);
  await within(dialog).findByRole('option', { name: /Home/ });
  await user.keyboard('{Enter}');
  await within(dialog).findByRole('option', { name: /billing/ });

  return dialog;
}

export const names = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole('option')
    .map((o) => within(o).getAllByText(/./)[0]?.textContent);
