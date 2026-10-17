/**
 * Pins: archived projects are listed under an "Archived" heading in the project switcher,
 * can be opened read-only, and can be unarchived from the menu, the banner and the project
 * settings; an archived project shows a banner and a disabled composer.
 *
 * Why: archive used to be a one-way door and archived projects vanished (d-0157). If the
 *   switcher hid them, the owner could not read their history or undo a mis-click; if an
 *   archived project looked like any other, a user would type into a box that takes no work.
 * Depends on: shell switcher, project scope, settings archive section, renderApp, fake Forge.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MessageComposer } from '#/components/card/message-composer.js';
import { projectPrefsStore } from '#/state/current-project.js';
import { ProjectArchivedContext } from '#/state/project-archived.js';
import { locationOf, renderApp } from '#tests/helpers/render-app.js';
import { renderScreens } from '#tests/helpers/render-screens.js';

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Switch project' }));

  return screen.findByRole('menu');
}

describe('switcher Archived section', () => {
  it('lists archived projects under the Archived heading, apart from the open ones', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/p/sample-service' });
    const menu = await openMenu(user);

    const archived = within(menu).getByRole('group', { name: 'Archived projects' });

    expect(within(menu).getByText('Archived')).toBeInTheDocument();
    expect(within(archived).getByText('sample-legacy')).toBeInTheDocument();
    expect(
      within(within(menu).getByRole('group', { name: 'Open projects' })).queryByText(
        'sample-legacy',
      ),
    ).toBeNull();
  });

  it('hides the section when nothing is archived', async () => {
    const user = userEvent.setup();
    renderApp({
      path: '/p/sample-service',
      routes: {
        'GET /projects': () => ({
          body: {
            projects: [
              {
                id: 'a',
                slug: 'sample-service',
                prefix: 'SVC',
                status: 'ready',
                ecosystems: [],
              },
            ],
          },
        }),
      },
    });

    const menu = await openMenu(user);

    expect(within(menu).queryByText('Archived')).toBeNull();
  });

  it('opens an archived project when it is chosen', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: '/p/sample-service/board' });
    const menu = await openMenu(user);

    await user.click(within(menu).getByRole('menuitemradio', { name: /sample-legacy/ }));

    await waitFor(() => expect(locationOf(router)).toBe('/p/sample-legacy/board'));
  });

  it('unarchives from the row: calls the API and moves the project to the open list', async () => {
    const user = userEvent.setup();
    const { forge } = renderApp({ path: '/p/sample-service' });
    const menu = await openMenu(user);

    await user.click(
      within(menu).getByRole('menuitem', { name: 'Unarchive sample-legacy' }),
    );

    await waitFor(() =>
      expect(forge.stub.calls).toContainEqual(
        expect.objectContaining({
          method: 'PATCH',
          path: '/projects/sample-legacy',
          body: { status: 'ready' },
        }),
      ),
    );

    const again = await openMenu(user);
    await waitFor(() =>
      expect(
        within(within(again).getByRole('group', { name: 'Open projects' })).getByText(
          'sample-legacy',
        ),
      ).toBeInTheDocument(),
    );

    expect(within(again).queryByText('Archived')).toBeNull();
  });
});

describe('archived project screens', () => {
  it('shows the read-only banner and unarchives from it', async () => {
    projectPrefsStore.setState({ slug: null });
    const user = userEvent.setup();
    renderApp({ path: '/p/sample-legacy' });

    expect(
      await screen.findByText('This project is archived. It takes no new work.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Unarchive' }));

    await waitFor(() =>
      expect(
        screen.queryByText('This project is archived. It takes no new work.'),
      ).toBeNull(),
    );
  });

  it('disables the message composer with a reason while the project is archived', () => {
    render(
      <ProjectArchivedContext.Provider value>
        <MessageComposer
          id="c"
          label="Message"
          draftKey="archived-test"
          sendLabel="Send"
          sending={false}
          onSend={() => undefined}
        />
      </ProjectArchivedContext.Provider>,
    );

    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled();
    expect(screen.getByText(/This project is archived/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('shows no banner on an open project', async () => {
    renderApp({ path: '/p/sample-service' });
    await screen.findByRole('navigation', { name: 'Project' });

    expect(screen.queryByText(/This project is archived/)).toBeNull();
  });

  it('offers Unarchive project in settings of an archived project, after a confirm', async () => {
    const user = userEvent.setup();
    renderScreens('/p/sample-legacy/settings/danger');

    await user.click(await screen.findByRole('button', { name: 'Unarchive project' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Unarchive sample-legacy?',
    });

    await user.click(within(dialog).getByRole('button', { name: 'Unarchive project' }));

    expect(
      await screen.findByRole('button', { name: 'Archive project' }),
    ).toBeInTheDocument();
  });
});
