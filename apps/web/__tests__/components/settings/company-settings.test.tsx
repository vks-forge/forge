/**
 * Pins: Limits and General show the current version, validate in the unit the user sees, save
 * a new version on top of the previous overrides, recover from a version conflict without
 * overwriting anyone, guard unsaved edits, and list history.
 *
 * Why: these dials decide how many Workers run and how much a run may spend. A save that
 *   overwrote a colleague's change, dropped earlier overrides, or accepted "5" in a field that
 *   needs at least 10 seconds would silently change how Forge behaves.
 * Depends on: src/routes/settings/*, src/state/use-company-draft, helpers/render-settings. jsdom.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderSettings } from '#tests/helpers/render-settings.js';

async function fillSave(user: ReturnType<typeof userEvent.setup>, reason: string) {
  const form = await screen.findByRole('form', { name: 'Save settings' });
  const name = within(form).getByLabelText('Your name');
  await user.clear(name);
  await user.type(name, 'Vik');
  await user.type(within(form).getByLabelText('Why you are changing it'), reason);

  return form;
}

describe('Limits', () => {
  it('shows the current version, its author and the fields', async () => {
    renderSettings('/settings/limits');

    expect(await screen.findByText(/saved by fixture-owner/)).toBeVisible();
    expect(screen.getAllByText('Version 2').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('On this machine')).toHaveValue(3);
    expect(screen.getByLabelText('Per project')).toHaveValue(1);
    expect(screen.getByLabelText('Wait when no reset time is given')).toHaveValue(60);
  });

  it('saves a new version that keeps the earlier overrides', async () => {
    const user = userEvent.setup();
    const { api } = renderSettings('/settings/limits');
    const field = await screen.findByLabelText('Per project');

    await user.clear(field);
    await user.type(field, '2');
    const form = await fillSave(user, 'Bigger machine');
    await user.click(within(form).getByRole('button', { name: 'Save as version 3' }));

    expect(await screen.findByText('Saved as a new version')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByText('Version 3').length).toBeGreaterThan(0),
    );

    const history = await api.settings.companyHistory();
    const saved = history.at(-1);

    expect(saved?.version).toBe(3);
    expect(saved?.author).toBe('Vik');
    expect(saved?.doc).toEqual({
      engine: {
        max_concurrent_global: 3,
        shutdown_drain_ms: 20_000,
        max_concurrent_per_project: 2,
      },
    });

    expect(
      within(screen.getByRole('list', { name: 'Settings history' })).getAllByRole(
        'listitem',
      )[0],
    ).toHaveTextContent('engine.max_concurrent_per_project = 2');
  });

  it('says what is wrong in the unit shown and blocks the save', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/general');
    const field = await screen.findByLabelText('Look for work every');

    await user.clear(field);
    await user.type(field, '5');

    expect(await screen.findByText('Must be at least 10 s.')).toBeVisible();

    await fillSave(user, 'Faster');

    expect(screen.getByText(/Fix 1 field marked above/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save as version 3' })).toBeDisabled();
  });

  it('rejects an emptied number instead of saving zero', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/limits');

    await user.clear(await screen.findByLabelText('On this machine'));

    expect(await screen.findByText('Enter a number.')).toBeVisible();
  });

  it('refuses to overwrite a newer version and offers a way forward', async () => {
    const user = userEvent.setup();
    const { api } = renderSettings('/settings/limits');
    const field = await screen.findByLabelText('Per project');
    await user.clear(field);
    await user.type(field, '2');
    const form = await fillSave(user, 'Mine');

    // A colleague saves while this page is open.
    await api.settings.saveCompany({
      doc: { engine: { max_concurrent_global: 4 } },
      author: 'colleague',
      reason: 'Theirs',
      expectedVersion: 2,
    });

    await user.click(within(form).getByRole('button', { name: 'Save as version 3' }));

    expect(
      await screen.findByText('These settings changed since you opened this page'),
    ).toBeInTheDocument();

    expect((await api.settings.companyHistory()).at(-1)?.author).toBe('colleague');
    expect((await api.settings.companyHistory()).length).toBe(3);

    await user.click(screen.getByRole('button', { name: 'Keep my edits on top' }));

    await waitFor(() => expect(screen.getByLabelText('On this machine')).toHaveValue(4));
    expect(screen.getByLabelText('Per project')).toHaveValue(2);
    expect(screen.getByRole('button', { name: 'Save as version 4' })).toBeVisible();
  });

  it('drops the edits when the user reloads after a conflict', async () => {
    const user = userEvent.setup();
    const { api } = renderSettings('/settings/limits');
    const field = await screen.findByLabelText('Per project');
    await user.clear(field);
    await user.type(field, '2');
    const form = await fillSave(user, 'Mine');
    await api.settings.saveCompany({
      doc: {},
      author: 'colleague',
      reason: 'Theirs',
      expectedVersion: 2,
    });

    await user.click(within(form).getByRole('button', { name: 'Save as version 3' }));

    await user.click(await screen.findByRole('button', { name: /Reload latest/ }));

    await waitFor(() => expect(screen.getByLabelText('Per project')).toHaveValue(1));
    expect(screen.getAllByText('Version 3').length).toBeGreaterThan(0);
  });

  it('asks before leaving with unsaved edits', async () => {
    const user = userEvent.setup();
    const { router } = renderSettings('/settings/limits');
    const field = await screen.findByLabelText('Per project');
    await user.clear(field);
    await user.type(field, '2');

    await user.click(
      within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole(
        'link',
        { name: 'General' },
      ),
    );

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Discard unsaved changes?',
    );

    expect(router.state.location.pathname).toBe('/settings/limits');
  });

  it('adds and removes a per-harness cap in the draft', async () => {
    const user = userEvent.setup();
    renderSettings('/settings/limits');

    await user.type(await screen.findByLabelText('Add a harness cap'), 'claude');
    await user.click(screen.getAllByRole('button', { name: 'Add' })[0]!);

    expect(await screen.findByLabelText('claude')).toHaveValue(1);

    await user.click(screen.getByRole('button', { name: 'Remove claude' }));

    expect(screen.queryByLabelText('claude')).not.toBeInTheDocument();
  });

  it('shows a retryable error when settings cannot load', async () => {
    renderSettings('/settings/limits', { scenario: 'error' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach Forge');
  });
});

describe('General', () => {
  it('shows the data folder as read-only text and lists history', async () => {
    renderSettings('/settings/general');

    expect(await screen.findByRole('heading', { name: 'Data folder' })).toBeVisible();
    expect(screen.getByText(/cannot be changed from here/)).toBeVisible();
    expect(screen.getByLabelText('On stop, let running tools finish for')).toHaveValue(
      20,
    );

    expect(screen.getByText('Let long tool calls finish on stop')).toBeVisible();
  });

  it('offers built-in defaults honestly when nothing was ever saved', async () => {
    renderSettings('/settings/general', { scenario: 'empty' });

    expect(await screen.findByText(/built-in defaults/)).toBeVisible();
    expect(screen.getByText('No version has been saved yet.')).toBeVisible();
  });
});
