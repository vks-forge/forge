/**
 * Pins: on a narrow screen the sidebar is a drawer opened from the top bar, and choosing a
 * destination closes it; on a wide screen the sidebar is always visible.
 *
 * Why: 320 to 768 px must work without sideways scrolling, which means the permanent sidebar
 *   column cannot exist there. If the drawer failed to open or to close on navigation, phone
 *   users could not move around the app at all.
 * Depends on: src/components/shell/app-shell, helpers/render-app. jsdom.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { setMatchMedia } from '#tests/helpers/match-media.js';
import { locationOf, renderApp } from '#tests/helpers/render-app.js';

describe('responsive sidebar', () => {
  it('is a permanent column on wide screens', async () => {
    renderApp({ path: '/p/sample-service' });

    expect(
      await screen.findByRole('navigation', { name: 'Project' }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole('button', { name: 'Open navigation' }),
    ).not.toBeInTheDocument();
  });

  it('opens as a drawer on narrow screens and closes after choosing a screen', async () => {
    setMatchMedia((query) => query.includes('max-width: 767px'));
    const user = userEvent.setup();
    const { router } = renderApp({ path: '/p/sample-service' });

    expect(screen.queryByRole('navigation', { name: 'Project' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Open navigation' }));

    const drawer = await screen.findByRole('dialog', { name: 'Navigation' });
    await user.click(within(drawer).getByRole('link', { name: 'Memory' }));

    await waitFor(() => expect(locationOf(router)).toBe('/p/sample-service/memory'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
