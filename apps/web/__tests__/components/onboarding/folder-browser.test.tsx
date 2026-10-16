/**
 * Pins: the in-app folder browser behind "Choose a folder" (the fallback when the system folder
 * window is unavailable, stubbed so here): it opens at the drives and home folder, walks into a
 * folder, orders folders by name or date, makes a new folder in place, offers a right-click menu
 * (open, select, new folder inside, copy path, show in the file manager), and says in plain words
 * when a folder cannot be opened.
 *
 * Why: a browser page cannot learn a folder's absolute path from a file picker, so people who
 * do not remember `C:\code\my-app` depend on this dialog to register a project at all. It must
 * never choose a folder until "Select this folder" (or the menu item) is used, must not offer to
 * select the list of drives itself, must not highlight every name on a double-click, and must
 * refuse an unsafe folder name beside the box before asking the server.
 * Depends on: components/onboarding/folder-browser, helpers/render-onboarding, helpers/onboarding-fixtures,
 *   helpers/fetch-stub.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json } from '#tests/helpers/fetch-stub.js';
import { BASE_ROUTES } from '#tests/helpers/onboarding-fixtures.js';
import { renderOnboarding } from '#tests/helpers/render-onboarding.js';
import {
  intoHome,
  names,
  openBrowser,
  ROUTES,
} from '#tests/helpers/folder-browser-fixtures.js';

describe('folder browser: walking', () => {
  it('opens at the places to start from and cannot select them', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', ROUTES);

    const dialog = await openBrowser(user);

    expect(
      await within(dialog).findByRole('option', { name: /Home/ }),
    ).toBeInTheDocument();

    expect(within(dialog).getByText('This computer')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Select this folder' }),
    ).toBeDisabled();

    expect(within(dialog).getByRole('button', { name: 'Up one folder' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'New folder' })).toBeDisabled();
  });

  it('opens a folder with Enter, marks repositories, and selecting hands it to the wizard and checks it', async () => {
    const user = userEvent.setup();
    const { callsTo } = renderOnboarding('/projects/new', ROUTES);

    const dialog = await intoHome(user);
    const repo = within(dialog).getByRole('option', { name: /billing/ });

    expect(within(repo).getByText('Git repository')).toBeInTheDocument();
    expect(within(dialog).getByText('/home/me')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Select this folder' }));

    expect(await screen.findByLabelText('Chosen folder /home/me')).toBeInTheDocument();
    await waitFor(() => expect(callsTo('POST /projects/inspect')).toHaveLength(1));
    expect(callsTo('POST /projects/inspect')[0]?.body).toEqual({
      local_path: '/home/me',
    });
  });

  it('goes up one folder with the Up button', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', ROUTES);

    const dialog = await intoHome(user);

    await user.click(within(dialog).getByRole('button', { name: 'Up one folder' }));

    expect(await within(dialog).findByRole('option', { name: 'me' })).toBeInTheDocument();
    expect(within(dialog).getByText('/home')).toBeInTheDocument();
  });

  it('leaves the wizard without a folder on Cancel', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', ROUTES);

    const dialog = await openBrowser(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Choose a folder' }),
      ).not.toBeInTheDocument(),
    );

    expect(screen.getByRole('button', { name: /Choose a folder/ })).toBeInTheDocument();
  });

  it('says a start folder is gone and offers the drives instead', async () => {
    const user = userEvent.setup();
    let picks = 0;
    renderOnboarding('/projects/new', {
      ...ROUTES,
      'POST /fs/pick-folder': () => {
        picks += 1;

        return picks === 1
          ? json({ status: 'picked', path: '/gone/away' })
          : json({ status: 'unavailable', reason: 'test desktop' });
      },
      'POST /projects/inspect': { body: BASE_ROUTES['POST /projects/inspect'] },
    });

    await user.click(await screen.findByRole('button', { name: /Choose a folder/ }));
    await user.click(await screen.findByRole('button', { name: 'Change' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose a folder' });

    expect(
      await within(dialog).findByText('That folder does not exist'),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('button', { name: 'Show drives and home' }),
    );

    expect(
      await within(dialog).findByRole('option', { name: /Home/ }),
    ).toBeInTheDocument();
  });

  it('turns text selection off for the list so a double-click does not highlight every name', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', ROUTES);

    const dialog = await intoHome(user);
    const list = within(dialog).getByRole('listbox');

    expect(list).toHaveClass('select-none');
    expect(within(dialog).getByRole('option', { name: /notes/ })).toHaveClass(
      'select-none',
    );
  });
});

describe('folder browser: sorting', () => {
  it('lists by name first, then by date newest or oldest from the Sort menu', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', ROUTES);

    const dialog = await intoHome(user);

    expect(names(dialog)).toEqual(['archive', 'billing', 'notes']);

    await user.click(within(dialog).getByRole('button', { name: 'Sort folders' }));
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'Date modified, newest first' }),
    );

    await waitFor(() => expect(names(dialog)).toEqual(['notes', 'billing', 'archive']));

    await user.click(within(dialog).getByRole('button', { name: 'Sort folders' }));
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'Date modified, oldest first' }),
    );

    await waitFor(() => expect(names(dialog)).toEqual(['archive', 'billing', 'notes']));

    await user.click(within(dialog).getByRole('button', { name: 'Sort folders' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Name Z to A' }));

    await waitFor(() => expect(names(dialog)).toEqual(['notes', 'billing', 'archive']));
  });
});
