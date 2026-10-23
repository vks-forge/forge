/**
 * Pins: General shows how much disk the setup cache uses and its size limit (default 5 GB), saves a
 * changed limit as `engine.setup_cache_gb` in a new company version, and "Clear setup cache" asks
 * first, naming what is removed and how much it frees; the shared downloads are an unticked extra;
 * Cancel removes nothing; after a clear the screen reports the space freed and re-reads the size.
 *
 * Why: the cache is disk the owner did not choose to fill, and clearing costs the next ticket of
 *   every project a cold install. The owner must be told the cost and the gain before it happens,
 *   and must be able to back out.
 * Depends on: components/settings/setup-cache-section, routes/settings/general-page, helpers/render-settings. jsdom.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderSettings } from '#tests/helpers/render-settings.js';

const section = async (): Promise<HTMLElement> =>
  (await screen.findByText('Setup cache', { selector: 'h2, h3' })).closest(
    'section',
  ) as HTMLElement;

describe('Setup cache on General', () => {
  it('shows the limit (5 GB by default) and what the cache uses now', async () => {
    renderSettings('/settings/general');
    const box = await section();

    expect(within(box).getByLabelText('Setup cache size limit')).toHaveValue(5);
    expect(await within(box).findByText(/1\.5 GB/)).toBeInTheDocument();
    expect(within(box).getByText(/200 MB/)).toBeInTheDocument();
  });

  it('saves a changed limit as engine.setup_cache_gb', async () => {
    const user = userEvent.setup();
    const { api } = renderSettings('/settings/general');
    const field = within(await section()).getByLabelText('Setup cache size limit');

    await user.clear(field);
    await user.type(field, '12');

    const form = await screen.findByRole('form', { name: 'Save settings' });
    const name = within(form).getByLabelText('Your name');
    await user.clear(name);
    await user.type(name, 'Vik');
    await user.type(within(form).getByLabelText('Why you are changing it'), 'more room');
    await user.click(within(form).getByRole('button', { name: /Save as version/ }));

    await screen.findByText('Saved as a new version');

    const saved = (await api.settings.companyHistory()).at(-1);

    expect((saved?.doc as { engine: Record<string, unknown> }).engine).toMatchObject({
      setup_cache_gb: 12,
    });
  });

  it('asks first, naming the space it frees, and clears only the installs by default', async () => {
    const user = userEvent.setup();
    const { api } = renderSettings('/settings/general');
    const box = await section();
    await within(box).findByText(/1\.5 GB/);

    await user.click(within(box).getByRole('button', { name: 'Clear setup cache' }));

    const dialog = await screen.findByRole('alertdialog');

    expect(dialog).toHaveTextContent(/saved copies of installed folders \(1\.5 GB\)/);
    expect(dialog).toHaveTextContent(/installs from scratch once/);
    expect(within(dialog).getByRole('checkbox')).not.toBeChecked();

    await user.click(
      within(dialog).getByRole('button', { name: 'Clear and free 1.5 GB' }),
    );

    expect(await within(box).findByText('Freed 1.5 GB.')).toBeInTheDocument();
    expect(await api.settings.setupCache()).toEqual({
      setup_bytes: 0,
      downloads_bytes: 209_715_200,
    });
  });

  it('also clears the shared downloads when ticked, and the button says how much it frees', async () => {
    const user = userEvent.setup();
    const { api } = renderSettings('/settings/general');
    const box = await section();
    await within(box).findByText(/1\.5 GB/);

    await user.click(within(box).getByRole('button', { name: 'Clear setup cache' }));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(
      within(dialog).getByRole('button', { name: 'Clear and free 1.7 GB' }),
    );

    expect(await within(box).findByText('Freed 1.7 GB.')).toBeInTheDocument();
    expect(await api.settings.setupCache()).toEqual({
      setup_bytes: 0,
      downloads_bytes: 0,
    });
  });

  it('removes nothing on Cancel', async () => {
    const user = userEvent.setup();
    const { api } = renderSettings('/settings/general');
    const box = await section();
    await within(box).findByText(/1\.5 GB/);

    await user.click(within(box).getByRole('button', { name: 'Clear setup cache' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );

    expect((await api.settings.setupCache()).setup_bytes).toBe(1_610_612_736);
    expect(within(box).queryByText(/^Freed/)).not.toBeInTheDocument();
  });
});
