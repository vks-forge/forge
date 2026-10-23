/**
 * Pins: each setup step says what it reuses between tickets ("Cache: restores node_modules",
 * "Downloads shared" or "No cache"), the copy-cache switch clears only the restored folders on
 * save while the download-cache settings and toolchain probe go through untouched, and the owner is
 * told in plain words what turning it off does.
 *
 * Why: the copy cache is what makes a second ticket's workspace ready in seconds; turning it off
 *   is a real choice with a cost (a cold install every ticket), and saving the editor must never
 *   silently erase cache settings the recipe put there.
 * Depends on: routes/project-settings (setup-section, setup-editor), the stubbed Forge server,
 *   helpers/render-screens.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderScreens } from '#tests/helpers/render-screens.js';

const CHECKS = '/p/sample-service/settings/checks';

const section = async (): Promise<HTMLElement> =>
  (await screen.findByText('Before each ticket')).closest('#setup') as HTMLElement;

describe('Before each ticket: cache', () => {
  it('shows the cache line on detected steps', async () => {
    renderScreens(CHECKS);
    const list = await within(await section()).findByRole('list', {
      name: 'Detected setup steps',
    });

    expect(list).toHaveTextContent('Cache: restores node_modules');
  });

  it('says "Downloads shared" for a step with only a shared download cache', async () => {
    renderScreens('/p/sample-web/settings/checks');
    const list = await within(await section()).findByRole('list', {
      name: 'Detected setup steps',
    });

    expect(list).toHaveTextContent('Downloads shared');
  });

  it('says "No cache" for a step added by hand, with no switch to flip', async () => {
    const user = userEvent.setup();
    renderScreens('/p/sample-docs/settings/checks');
    const box = await section();
    await user.click(await within(box).findByRole('button', { name: 'Add a step' }));

    expect(within(box).getByText('No cache')).toBeInTheDocument();
    expect(
      within(box).queryByRole('switch', { name: 'Setup step 1 copy cache' }),
    ).not.toBeInTheDocument();
  });

  it('turns the copy cache off: explains it, and saves empty cache_outputs but keeps the rest', async () => {
    const user = userEvent.setup();
    const { api } = renderScreens(CHECKS);
    const box = await section();
    await user.click(await within(box).findByRole('button', { name: 'Customise' }));

    const toggle = within(box).getByRole('switch', { name: 'Setup step 1 copy cache' });

    expect(toggle).toBeChecked();
    expect(within(box).getByText('Cache: restores node_modules')).toBeInTheDocument();

    await user.click(toggle);

    expect(within(box).getByText('Downloads shared')).toBeInTheDocument();
    expect(within(box).getByText(/installs from scratch for every ticket/)).toBeVisible();

    await user.type(screen.getByLabelText('Reason for this change'), 'cold installs');
    await user.click(screen.getByRole('button', { name: 'Save as v4' }));
    await screen.findByText(/Saved as version 4/);

    const { override } = await api.projectSettings.get('sample-service');

    expect(override['setup']).toEqual([
      expect.objectContaining({
        cache_outputs: [],
        cache_env: { npm_config_store_dir: 'pnpm' },
      }),
    ]);
  });

  it('turning it back on before saving restores the folders', async () => {
    const user = userEvent.setup();
    const { api } = renderScreens(CHECKS);
    const box = await section();
    await user.click(await within(box).findByRole('button', { name: 'Customise' }));

    const toggle = within(box).getByRole('switch', { name: 'Setup step 1 copy cache' });
    await user.click(toggle);
    await user.click(toggle);
    await user.type(within(box).getByLabelText('Setup step 1 name'), ' x');
    await user.type(screen.getByLabelText('Reason for this change'), 'rename');
    await user.click(screen.getByRole('button', { name: 'Save as v4' }));
    await screen.findByText(/Saved as version 4/);

    expect((await api.projectSettings.get('sample-service')).override['setup']).toEqual([
      expect.objectContaining({ cache_outputs: ['node_modules'] }),
    ]);
  });
});
