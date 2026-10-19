/**
 * Pins: the shell shows the project and Forge navigation, Overview is first in the Forge section
 * and the logo leads to it, `/` opens the Overview (it no longer jumps into a project), and the
 * project switcher lists open projects, changes the project in place and keeps the same screen.
 *
 * Why: the sidebar is how every other screen is reached (d-0104). If the nav lost an entry, if
 *   `/` jumped into the last project instead of the cross-project Overview (d-0162), if the switcher offered an archived project or dropped the
 *   user on a different screen, every later batch would build on a broken frame.
 * Depends on: src/components/shell/*, src/routes/*, helpers/render-app. jsdom.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { projectPrefsStore } from '#/state/current-project.js';
import { locationOf, renderApp } from '#tests/helpers/render-app.js';

describe('AppShell navigation', () => {
  it('shows every project destination and one Forge settings entry', async () => {
    renderApp({ path: '/p/sample-service' });

    const project = await screen.findByRole('navigation', { name: 'Project' });
    const labels = within(project)
      .getAllByRole('link')
      .map((link) => link.textContent);

    const forge = screen.getByRole('navigation', { name: 'Forge settings' });

    expect(labels).toEqual([
      'Home',
      'Inbox',
      'Board',
      'Tickets',
      'Issues',
      'Chat',
      'Runs',
      'Cost',
      'Memory',
      'Project settings',
    ]);

    expect(
      within(forge)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Forge settings']);

    expect(within(forge).getByRole('link', { name: 'Forge settings' })).toHaveAttribute(
      'href',
      '/settings',
    );

    expect(within(project).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('never labels the server data as samples: the app has no fixture source (d-0123)', async () => {
    renderApp({ path: '/p/sample-service' });

    await screen.findByRole('navigation', { name: 'Project' });

    expect(screen.queryByText('Fixture data')).not.toBeInTheDocument();
  });

  it('puts Overview first in the Forge section and makes the logo lead to it', async () => {
    renderApp({ path: '/p/sample-service/board' });

    const forge = await screen.findByRole('navigation', { name: 'Forge' });
    const overview = within(forge).getByRole('link', { name: 'Overview' });

    expect(overview).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Forge' })).toHaveAttribute('href', '/');
  });

  it('opens the Overview at `/` and stays there, even with a project remembered', async () => {
    projectPrefsStore.setState({ slug: 'sample-web' });
    const { router } = renderApp({ path: '/' });

    expect(
      await screen.findByRole('heading', { name: 'Overview', level: 1 }),
    ).toBeInTheDocument();

    expect(locationOf(router)).toBe('/');
  });

  it('still remembers the last project for the switcher while on the Overview', async () => {
    projectPrefsStore.setState({ slug: 'sample-web' });
    renderApp({ path: '/' });

    await screen.findByRole('heading', { name: 'Overview', level: 1 });

    expect(
      await screen.findByRole('button', { name: 'Switch project' }),
    ).toHaveTextContent('sample-web');
  });

  it('shows a placeholder naming the batch that will build the screen', async () => {
    renderApp({ path: '/p/sample-service/issues' });

    expect(
      await screen.findByRole('heading', { name: 'Issues is not built yet' }),
    ).toBeInTheDocument();

    expect(screen.getByText(/Coming in W8/)).toBeInTheDocument();
  });

  it('says so when the project in the URL does not exist', async () => {
    renderApp({ path: '/p/nope/board' });

    expect(await screen.findByText(/There is no project named/)).toBeInTheDocument();
  });

  it('keeps the project nav while on Forge settings', async () => {
    renderApp({ path: '/settings/harnesses' });

    const project = await screen.findByRole('navigation', { name: 'Project' });

    await waitFor(() =>
      expect(within(project).getByRole('link', { name: 'Board' })).toHaveAttribute(
        'href',
        '/p/sample-service/board',
      ),
    );
  });
});

describe('ProjectSwitcher', () => {
  it('lists open projects from the adapter and switches while keeping the screen', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: '/p/sample-service/board' });

    await user.click(await screen.findByRole('button', { name: 'Switch project' }));
    const menu = await screen.findByRole('menu');
    const names = within(within(menu).getByRole('group', { name: 'Open projects' }))
      .getAllByRole('menuitemradio')
      .map((item) => item.textContent);

    expect(names.join('|')).toContain('sample-service');
    expect(names.join('|')).toContain('sample-web');
    expect(names.join('|')).toContain('sample-docs');
    expect(names.join('|')).not.toContain('sample-legacy');

    await user.click(within(menu).getByRole('menuitemradio', { name: /sample-web/ }));

    await waitFor(() => expect(locationOf(router)).toBe('/p/sample-web/board'));
    expect(
      await screen.findByText('sample-web', { selector: 'h1 + span' }),
    ).toBeInTheDocument();
  });

  it('opens with Ctrl+K from anywhere', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/p/sample-service' });
    await screen.findByRole('button', { name: 'Switch project' });

    await user.keyboard('{Control>}k{/Control}');

    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });

  it('goes to the new project Home when switching from Forge settings', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: '/settings/limits' });

    await user.click(await screen.findByRole('button', { name: 'Switch project' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /sample-web/ }));

    await waitFor(() => expect(locationOf(router)).toBe('/p/sample-web'));
  });

  it('shows an empty state when Forge has no projects', async () => {
    renderApp({ path: '/', scenario: 'empty' });

    expect(
      await screen.findByText('No projects yet', { selector: 'h2' }),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Switch project' })).toHaveTextContent(
      'No projects yet',
    );
  });

  it('shows a loading skeleton, then an error with a way to retry', async () => {
    renderApp({ path: '/', scenario: 'error' });

    expect(
      screen.getByRole('status', { name: 'Loading the overview' }),
    ).toBeInTheDocument();

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach Forge');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch project' })).toHaveTextContent(
      'Projects unavailable',
    );
  });
});
