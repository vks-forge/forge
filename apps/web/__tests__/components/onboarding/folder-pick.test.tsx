/**
 * Pins: "Choose a folder" in the add-project dialog opens the system folder window through the
 * server and uses its answer: a picked folder is shown as a chip and checked at once, a closed
 * window changes nothing, "Change" opens the window in the folder already chosen, and a window
 * that cannot open falls back to Forge's own folder browser with a note saying why.
 *
 * Why: a web page cannot read a folder's absolute path, so Browse asks the server (which runs
 * on the person's desktop) to open Explorer or Finder. People must see that a window is
 * coming (it may sit behind the browser), must never lose a chosen folder when they close it,
 * and must never meet a Browse button that does nothing on a machine with no desktop.
 * Depends on: components/onboarding/step-folder, helpers/render-onboarding, helpers/onboarding-fixtures,
 *   helpers/fetch-stub.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';
import { BASE_ROUTES, inspection } from '#tests/helpers/onboarding-fixtures.js';
import { renderOnboarding } from '#tests/helpers/render-onboarding.js';

const BASE: Routes = {
  ...BASE_ROUTES,
  'POST /projects/inspect': { body: inspection({ local_path: 'C:\\code\\billing' }) },
  'GET /fs/folders': json({
    path: '',
    parent: null,
    entries: [{ name: 'Home', path: '/home/me', is_repo: false, modified_at: null }],
    truncated: false,
  }),
};

const choose = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(await screen.findByRole('button', { name: /Choose a folder/ }));

describe('Choose a folder with the system folder window', () => {
  it('shows the picked folder as a chip and checks it', async () => {
    const user = userEvent.setup();
    const { callsTo } = renderOnboarding('/projects/new', {
      ...BASE,
      'POST /fs/pick-folder': json({ status: 'picked', path: 'C:\\code\\billing' }),
    });

    await choose(user);

    expect(
      await screen.findByLabelText('Chosen folder C:\\code\\billing'),
    ).toBeInTheDocument();

    expect(screen.getByText('billing')).toBeInTheDocument();

    await waitFor(() => expect(callsTo('POST /projects/inspect')).toHaveLength(1));
    expect(callsTo('POST /projects/inspect')[0]?.body).toEqual({
      local_path: 'C:\\code\\billing',
    });

    expect(await screen.findByText(/This folder can be a project/)).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: 'Choose a folder' }),
    ).not.toBeInTheDocument();
  });

  it('opens the window in the folder already chosen when the person presses Change', async () => {
    const user = userEvent.setup();
    let picks = 0;
    const { callsTo } = renderOnboarding('/projects/new', {
      ...BASE,
      'POST /fs/pick-folder': () => {
        picks += 1;

        return picks === 1
          ? json({ status: 'picked', path: 'C:\\code\\billing' })
          : json({ status: 'cancelled' });
      },
    });

    await choose(user);
    await user.click(await screen.findByRole('button', { name: 'Change' }));

    await waitFor(() => expect(callsTo('POST /fs/pick-folder')).toHaveLength(2));
    expect(callsTo('POST /fs/pick-folder')[1]?.body).toEqual({
      start: 'C:\\code\\billing',
    });

    expect(screen.getByLabelText('Chosen folder C:\\code\\billing')).toBeInTheDocument();
  });

  it('says it is waiting, with where the window may be, until the answer arrives', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', {
      ...BASE,
      'POST /fs/pick-folder': { body: { status: 'cancelled' }, delayMs: 150 },
    });

    await choose(user);

    const waiting = await screen.findByRole('button', {
      name: /Waiting for the folder window/,
    });

    expect(waiting).toBeDisabled();
    expect(screen.getByText(/It may be behind this browser/)).toBeInTheDocument();

    expect(await screen.findByRole('button', { name: /Choose a folder/ })).toBeEnabled();
    expect(screen.queryByText(/It may be behind this browser/)).not.toBeInTheDocument();
  });

  it('chooses nothing when the window is closed without a choice', async () => {
    const user = userEvent.setup();
    const { callsTo } = renderOnboarding('/projects/new', {
      ...BASE,
      'POST /fs/pick-folder': json({ status: 'cancelled' }),
    });

    await choose(user);

    await waitFor(() => expect(callsTo('POST /fs/pick-folder')).toHaveLength(1));
    expect(await screen.findByRole('button', { name: /Choose a folder/ })).toBeEnabled();
    expect(screen.queryByLabelText(/Chosen folder/)).not.toBeInTheDocument();
    expect(callsTo('POST /projects/inspect')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('opens the in-app browser with a note when no system window is available', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', {
      ...BASE,
      'POST /fs/pick-folder': json({
        status: 'unavailable',
        reason: 'no desktop session',
      }),
    });

    await choose(user);

    const dialog = await screen.findByRole('dialog', { name: 'Choose a folder' });

    expect(within(dialog).getByText(/no desktop session/)).toBeInTheDocument();
    expect(
      await within(dialog).findByRole('option', { name: /Home/ }),
    ).toBeInTheDocument();
  });

  it('opens the in-app browser when the server refuses the request', async () => {
    const user = userEvent.setup();
    renderOnboarding('/projects/new', {
      ...BASE,
      'POST /fs/pick-folder': refusal(409, 'picker_busy', 'already open'),
    });

    await choose(user);

    const dialog = await screen.findByRole('dialog', { name: 'Choose a folder' });

    expect(within(dialog).getByText(/could not open/)).toBeInTheDocument();
  });
});
