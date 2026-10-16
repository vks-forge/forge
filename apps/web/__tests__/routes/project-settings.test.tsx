/**
 * Pins: the project-settings screen: inherited versus overridden fields, a save that creates
 * the next version, validation before the server, a 409 that blocks instead of overwriting,
 * the history list, the unsaved-changes guard and the archive confirm.
 *
 * Why: this screen changes how Workers behave on a project. The failures that hurt are
 * quiet ones: an inherited value saved as an override, a save that silently overwrites
 * someone else's newer version, edits lost on a stray click, a project archived without a
 * warning. Each is pinned here over the stubbed Forge server, which merges and compare-and-swaps
 * like the server.
 * Depends on: routes/project-settings, the stubbed Forge server, renderApp, renderScreens.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '#tests/helpers/render-app.js';
import { renderScreens } from '#tests/helpers/render-screens.js';

const PATH = '/p/sample-service/settings';

async function ready(): Promise<void> {
  await screen.findByRole('heading', { name: 'Project settings', level: 1 });
}

describe('project settings', () => {
  it('shows read-only project facts and the saved version', async () => {
    renderScreens(PATH);
    await ready();

    expect((await screen.findByText('Ticket prefix')).nextSibling).toHaveTextContent(
      'SVC',
    );

    expect(screen.getByText(/cannot be edited here/)).toBeInTheDocument();
    expect(screen.getByText(/Version 3/)).toBeInTheDocument();
  });

  it('distinguishes overridden fields from inherited ones and shows the inherited value', async () => {
    renderScreens(PATH);
    await ready();

    expect(
      screen.getByRole('switch', { name: 'Override Workers at once' }),
    ).toBeChecked();

    expect(
      screen.getByRole('switch', { name: 'Override Fallback harnesses' }),
    ).not.toBeChecked();

    expect(screen.getByText('codex')).toBeInTheDocument();
    expect(screen.getByText(/Company limit: /)).toHaveTextContent('2');
  });

  it('clearing an override and saving creates the next version without that key', async () => {
    const user = userEvent.setup();
    const { api } = renderScreens(PATH);
    await ready();

    await user.click(screen.getByRole('switch', { name: 'Override Workers at once' }));
    expect(screen.getByRole('button', { name: 'Save as v4' })).toBeDisabled();
    await user.type(
      screen.getByLabelText('Reason for this change'),
      'use the company limit',
    );

    await user.click(screen.getByRole('button', { name: 'Save as v4' }));

    expect(await screen.findByText(/Saved as version 4/)).toBeInTheDocument();
    const snapshot = await api.projectSettings.get('sample-service');
    expect(snapshot.version.project).toBe(4);
    expect(snapshot.override).not.toHaveProperty('max_concurrent');
    expect(snapshot.override).toHaveProperty('default_harness');
    expect(screen.getByText('use the company limit')).toBeInTheDocument();
  });

  it('refuses to raise the company concurrency before saving', async () => {
    const user = userEvent.setup();
    renderScreens(PATH);
    await ready();

    const box = screen.getByRole('textbox', { name: 'Workers at once' });
    await user.clear(box);
    await user.type(box, '9');

    expect(
      await screen.findByText(/A project can lower the company limit/),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Reason for this change'), 'try');
    expect(screen.getByRole('button', { name: 'Save as v4' })).toBeDisabled();
  });

  it('a newer version saved elsewhere blocks the save and offers a review, never an overwrite', async () => {
    const user = userEvent.setup();
    const { api } = renderScreens(PATH);
    await ready();

    await user.click(screen.getByRole('switch', { name: 'Override Remote name' }));
    await user.type(screen.getByLabelText('Reason for this change'), 'mine');
    await api.projectSettings.save({
      slug: 'sample-service',
      doc: { default_harness: 'codex' },
      reason: 'from another tab',
      expectedVersion: 3,
    });

    await user.click(screen.getByRole('button', { name: 'Save as v4' }));

    const banner = (await screen.findByText(/changed since you opened/)).closest(
      '[role="alert"]',
    ) as HTMLElement;

    expect(banner).toHaveTextContent(/changed since you opened/);
    expect(banner).toHaveTextContent('v3');
    await user.click(
      within(banner).getByRole('button', { name: 'Review their changes' }),
    );

    expect(within(banner).getByText('default_harness')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save as v4' })).toBeDisabled();

    await user.click(
      within(banner).getByRole('button', { name: /Reload latest and discard/ }),
    );

    await waitFor(() => expect(screen.getByText(/Version 4/)).toBeInTheDocument());
    expect(
      screen.getByRole('switch', { name: 'Override Remote name' }),
    ).not.toBeChecked();

    expect((await api.projectSettings.get('sample-service')).version.project).toBe(4);
  });

  it('lists every version newest first and expands a plain-words diff', async () => {
    const user = userEvent.setup();
    renderScreens(PATH);
    await ready();

    const items = within(
      screen.getByRole('list', { name: 'Saved versions' }),
    ).getAllByRole('listitem');

    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('v3');
    expect(items[0]).toHaveTextContent('Current');
    expect(items[2]).toHaveTextContent('forge-onboarding');

    await user.click(within(items[0] as HTMLElement).getByRole('button'));
    expect(
      within(items[0] as HTMLElement).getByText('Compared with v2'),
    ).toBeInTheDocument();

    expect(within(items[0] as HTMLElement).getByText('checks')).toBeInTheDocument();
  });

  it('says so for a project that has never saved settings', async () => {
    renderScreens('/p/sample-web/settings');
    await ready();

    expect(screen.getAllByText(/Nothing saved yet/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('switch', { name: 'Override Checks by role' }),
    ).not.toBeChecked();
  });

  it('asks before leaving with unsaved edits', async () => {
    const user = userEvent.setup();
    renderApp({ path: PATH });
    await ready();

    await user.click(screen.getByRole('switch', { name: 'Override Remote name' }));
    await user.click(screen.getAllByRole('link', { name: 'Board' })[0] as HTMLElement);

    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
  });

  it('archives only after a confirm that names the project and says it can be undone', async () => {
    const user = userEvent.setup();
    const { router } = renderScreens(PATH);
    await ready();

    await user.click(screen.getByRole('button', { name: 'Archive project' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Archive sample-service?',
    });

    expect(dialog).toHaveTextContent(/you can unarchive it/);
    expect(router.state.location.pathname).toBe(PATH);

    await user.click(within(dialog).getByRole('button', { name: 'Archive project' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('shows an error with a retry when Forge is unreachable', async () => {
    renderApp({ path: PATH, scenario: 'error' });

    expect(await screen.findByText('Cannot reach Forge')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(
      0,
    );
  });
});
