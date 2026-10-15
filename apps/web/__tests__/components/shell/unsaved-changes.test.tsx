/**
 * Pins: while a view holds unsaved edits, switching project or following a nav link asks first;
 * "Keep editing" (and Escape) stay put, "Discard changes" continues the navigation.
 *
 * Why: d-0104 promises an in-page alert before a project switch can lose edits. Losing a half-
 *   written settings form to one mis-click is the failure this guards, so the default answer
 *   must always be to stay, and a discard must happen only on an explicit choice.
 * Depends on: src/components/shell/leave-guard, src/state/unsaved-changes, helpers/render-app. jsdom.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DirtyView, locationOf, renderApp } from '#tests/helpers/render-app.js';

const DIRTY = '/p/sample-service/dirty';
const routes = [{ path: 'p/:slug/dirty', element: <DirtyView /> }];

async function chooseProject(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(await screen.findByRole('button', { name: 'Switch project' }));
  await user.click(await screen.findByRole('menuitemradio', { name }));
}

describe('unsaved changes guard', () => {
  it('asks before a project switch and stays when the user keeps editing', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: DIRTY, extraRoutes: routes });

    await chooseProject(user, /sample-web/);

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Discard unsaved changes?');
    expect(locationOf(router)).toBe(DIRTY);

    await user.click(screen.getByRole('button', { name: 'Keep editing' }));

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );

    expect(locationOf(router)).toBe(DIRTY);
    expect(screen.getByRole('heading', { name: 'Dirty form' })).toBeInTheDocument();
  });

  it('treats Escape as keep editing', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: DIRTY, extraRoutes: routes });

    await chooseProject(user, /sample-web/);
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );

    expect(locationOf(router)).toBe(DIRTY);
  });

  it('continues the switch when the user discards', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: DIRTY, extraRoutes: routes });

    await chooseProject(user, /sample-web/);
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(locationOf(router)).toBe('/p/sample-web/dirty'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('also guards ordinary navigation to another screen', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: DIRTY, extraRoutes: routes });

    await user.click(await screen.findByRole('link', { name: 'Board' }));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(locationOf(router)).toBe(DIRTY);
  });

  it('does not ask when nothing is unsaved', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: '/p/sample-service/board' });

    await chooseProject(user, /sample-web/);

    await waitFor(() => expect(locationOf(router)).toBe('/p/sample-web/board'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
