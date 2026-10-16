/**
 * Pins: the in-app folder browser's actions: ordering folders by name or date, making a new folder
 * in place, and the right-click menu (open, select, new folder inside, copy path, show in the file
 * manager) with its keyboard route.
 *
 * Why: finding and choosing a folder is the whole job of the browser. People look for a folder by
 * name or recency, need to make the one that does not exist yet without leaving the dialog, and
 * expect the usual folder menu. An unsafe folder name must be refused beside the box before the
 * server is asked, Esc must close the name row before the dialog, and a menu action that fails
 * (no file manager, no clipboard) must say so rather than do nothing.
 * Depends on: components/onboarding/folder-browser, helpers/folder-browser-fixtures,
 *   helpers/render-onboarding, helpers/fetch-stub.
 */

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';
import { renderOnboarding } from '#tests/helpers/render-onboarding.js';
import {
  entry,
  HOME_ENTRIES,
  home,
  intoHome,
  ROOTS,
  ROUTES,
} from '#tests/helpers/folder-browser-fixtures.js';

describe('folder browser: new folder', () => {
  function withCreate(extra: Routes = {}) {
    let entries = HOME_ENTRIES;

    return {
      ...ROUTES,
      'GET /fs/folders': ({ query }: { query: URLSearchParams }) => {
        const path = query.get('path');

        return path === '/home/me' ? json(home(entries)) : json(ROOTS);
      },
      'POST /fs/folders': ({ body }: { body: unknown }) => {
        const { name } = body as { name: string };
        const made = entry(name, '2026-10-16T10:00:00.000Z');

        entries = [...entries, made];

        return { status: 201, body: made };
      },
      ...extra,
    };
  }

  it('makes a folder in place, tells the person, and puts the keyboard on it', async () => {
    const user = userEvent.setup();
    const { callsTo } = renderOnboarding('/projects/new', withCreate());

    const dialog = await intoHome(user);
    await user.click(within(dialog).getByRole('button', { name: 'New folder' }));
    await user.type(within(dialog).getByLabelText('New folder name'), 'fresh{Enter}');

    expect(await screen.findByText('Folder created')).toBeInTheDocument();
    const made = await within(dialog).findByRole('option', { name: /fresh/ });

    expect(callsTo('POST /fs/folders')[0]?.body).toEqual({
      parent: '/home/me',
      name: 'fresh',
    });

    await waitFor(() => expect(made).toHaveAttribute('aria-selected', 'true'));
    expect(within(dialog).queryByLabelText('New folder name')).not.toBeInTheDocument();
  });

  it('refuses an unsafe or duplicate name beside the box without asking the server', async () => {
    const user = userEvent.setup();
    const { callsTo } = renderOnboarding('/projects/new', withCreate());

    const dialog = await intoHome(user);
    await user.click(within(dialog).getByRole('button', { name: 'New folder' }));
    const box = within(dialog).getByLabelText('New folder name');

    await user.type(box, 'a/b{Enter}');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/cannot contain/);
    expect(box).toHaveAttribute('aria-invalid', 'true');

    await user.clear(box);
    await user.type(box, 'Notes{Enter}');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /already exists here/,
    );

    expect(callsTo('POST /fs/folders')).toHaveLength(0);
  });

  it('shows the server refusing a name that appeared in the meantime', async () => {
    const user = userEvent.setup();
    renderOnboarding(
      '/projects/new',
      withCreate({ 'POST /fs/folders': refusal(409, 'folder_exists', 'exists') }),
    );

    const dialog = await intoHome(user);
    await user.click(within(dialog).getByRole('button', { name: 'New folder' }));
    await user.type(within(dialog).getByLabelText('New folder name'), 'later{Enter}');

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'later already exists here.',
    );
  });

  it('closes the name row with Esc without closing the browser', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', withCreate());

    const dialog = await intoHome(user);
    await user.click(within(dialog).getByRole('button', { name: 'New folder' }));
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(within(dialog).queryByLabelText('New folder name')).not.toBeInTheDocument(),
    );

    expect(screen.getByRole('dialog', { name: 'Choose a folder' })).toBeInTheDocument();
  });
});

describe('folder browser: right-click menu', () => {
  const rightClick = async (dialog: HTMLElement, name: RegExp) => {
    fireEvent.contextMenu(within(dialog).getByRole('option', { name }), {
      clientX: 80,
      clientY: 120,
    });

    return screen.findByRole('menu');
  };

  it('offers the five actions on a folder', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', ROUTES);

    const dialog = await intoHome(user);
    const menu = await rightClick(dialog, /notes/);

    for (const label of [
      'Open',
      'Select this folder',
      'New folder inside',
      'Copy path',
      /Show in/,
    ]) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeInTheDocument();
    }
  });

  it('opens the folder from the menu', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', {
      ...ROUTES,
      'GET /fs/folders': ({ query }) => {
        const path = query.get('path');

        if (path === '/home/me/notes') {
          return json({
            path,
            parent: '/home/me',
            entries: [entry('inner', '2026-01-01T00:00:00.000Z')],
            truncated: false,
          });
        }

        return path === '/home/me' ? json(home()) : json(ROOTS);
      },
    });

    const dialog = await intoHome(user);
    const menu = await rightClick(dialog, /notes/);
    await user.click(within(menu).getByRole('menuitem', { name: 'Open' }));

    expect(
      await within(dialog).findByRole('option', { name: /inner/ }),
    ).toBeInTheDocument();

    expect(within(dialog).getByText('/home/me/notes')).toBeInTheDocument();
  });

  it('selects the folder straight from the menu', async () => {
    const user = userEvent.setup();
    const { callsTo } = renderOnboarding('/projects/new', ROUTES);

    const dialog = await intoHome(user);
    const menu = await rightClick(dialog, /notes/);
    await user.click(within(menu).getByRole('menuitem', { name: 'Select this folder' }));

    expect(
      await screen.findByLabelText('Chosen folder /home/me/notes'),
    ).toBeInTheDocument();

    await waitFor(() => expect(callsTo('POST /projects/inspect')).toHaveLength(1));
  });

  it('copies the path and says so', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', ROUTES);

    const dialog = await intoHome(user);
    const menu = await rightClick(dialog, /notes/);
    await user.click(within(menu).getByRole('menuitem', { name: 'Copy path' }));

    expect(await screen.findByText('Path copied')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe('/home/me/notes');
  });

  it('asks the server to show the folder in the file manager', async () => {
    const user = userEvent.setup();
    const { callsTo } = renderOnboarding('/projects/new', {
      ...ROUTES,
      'POST /fs/reveal': json({ status: 'opened' }),
    });

    const dialog = await intoHome(user);
    const menu = await rightClick(dialog, /notes/);
    await user.click(within(menu).getByRole('menuitem', { name: /Show in/ }));

    await waitFor(() => expect(callsTo('POST /fs/reveal')).toHaveLength(1));
    expect(callsTo('POST /fs/reveal')[0]?.body).toEqual({ path: '/home/me/notes' });
  });

  it('says so when no file manager can open', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', {
      ...ROUTES,
      'POST /fs/reveal': json({ status: 'unavailable', reason: 'no desktop' }),
    });

    const dialog = await intoHome(user);
    const menu = await rightClick(dialog, /notes/);
    await user.click(within(menu).getByRole('menuitem', { name: /Show in/ }));

    expect(await screen.findByText(/Could not open/)).toBeInTheDocument();
    expect(screen.getByText('no desktop')).toBeInTheDocument();
  });

  it('opens a new-folder row inside the chosen folder', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', {
      ...ROUTES,
      'GET /fs/folders': ({ query }) => {
        const path = query.get('path');

        if (path === '/home/me/notes') {
          return json({ path, parent: '/home/me', entries: [], truncated: false });
        }

        return path === '/home/me' ? json(home()) : json(ROOTS);
      },
    });

    const dialog = await intoHome(user);
    const menu = await rightClick(dialog, /notes/);
    await user.click(within(menu).getByRole('menuitem', { name: 'New folder inside' }));

    expect(await within(dialog).findByLabelText('New folder name')).toBeInTheDocument();
    expect(within(dialog).getByText('/home/me/notes')).toBeInTheDocument();
  });

  it('opens from the keyboard with the menu key on the active folder', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', ROUTES);

    const dialog = await intoHome(user);
    within(dialog).getByRole('listbox').focus();
    await user.keyboard('{ArrowDown}{ContextMenu}');

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Open' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Choose a folder' })).toBeInTheDocument();
  });
});
