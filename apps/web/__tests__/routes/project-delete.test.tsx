/**
 * Pins: deleting a project from its settings screen: the red button stays off until the slug
 * is typed, the call carries that confirmation, a busy refusal shows inside the popup and
 * deletes nothing, and success leaves the screen.
 *
 * Why: delete destroys Forge's record of a project, so the popup must make the user say which
 * project and tell them their own folder stays; a refusal (work still running) must be
 * readable where the user is looking, and only a real success may navigate away. Each is
 * pinned over the stubbed Forge server.
 * Depends on: routes/project-settings, the stubbed Forge server, renderScreens.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import { renderScreens } from '#tests/helpers/render-screens.js';

const PATH = '/p/sample-service/settings';

async function openPopup(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: 'Project settings', level: 1 });
  await user.click(screen.getAllByRole('button', { name: 'Delete project' })[0]!);

  return screen.findByRole('dialog', { name: 'Delete sample-service?' });
}

describe('delete project', () => {
  it('says what goes and what stays, and keeps the button off until the slug is typed', async () => {
    const user = userEvent.setup();
    renderScreens(PATH);

    const dialog = await openPopup(user);
    const button = within(dialog).getByRole('button', { name: 'Delete project' });

    expect(dialog).toHaveTextContent(/worktrees/);
    expect(dialog).toHaveTextContent(/files are not touched/);
    expect(button).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/Type sample-service/), 'sample');
    expect(button).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/Type sample-service/), '-service');
    expect(button).toBeEnabled();
  });

  it('sends DELETE with the typed confirmation and leaves the screen on success', async () => {
    const user = userEvent.setup();
    const { forge, router } = renderScreens(PATH);

    const dialog = await openPopup(user);
    await user.type(
      within(dialog).getByLabelText(/Type sample-service/),
      'sample-service',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(forge.stub.callsTo('DELETE /projects/:slug')).toMatchObject([
      { path: '/projects/sample-service', body: { confirm: 'sample-service' } },
    ]);
  });

  it('shows the busy refusal inside the popup and stays on the screen', async () => {
    const user = userEvent.setup();
    const { forge, router } = renderScreens(PATH);
    forge.stub.use({
      'DELETE /projects/:slug': () =>
        refusal(409, 'project_busy', 'project sample-service has work running'),
    });

    const dialog = await openPopup(user);
    await user.type(
      within(dialog).getByLabelText(/Type sample-service/),
      'sample-service',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Stop its running work first',
    );

    expect(router.state.location.pathname).toBe(PATH);
  });

  it('holds the popup open and shows a pending state while the request is in flight', async () => {
    const user = userEvent.setup();
    const { forge } = renderScreens(PATH);
    forge.stub.use({
      'DELETE /projects/:slug': () => ({
        ...json({ deleted: 'sample-service' }),
        delayMs: 200,
      }),
    });

    const dialog = await openPopup(user);
    await user.type(
      within(dialog).getByLabelText(/Type sample-service/),
      'sample-service',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }));

    expect(
      within(dialog).getByRole('button', { name: 'Delete project' }),
    ).toHaveAttribute('aria-busy', 'true');

    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
