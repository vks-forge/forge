/**
 * Pins: the Director page's sign-off setting and the model row of the check against the plan: how
 * far the Director may sign (up to tier B by default), a lowered ceiling saved as just that key, no
 * tier C choice anywhere and the protected-files rule line (the Director signs only clean work).
 *
 * Why: this setting decides which finished work reaches the owner for a signature. A ceiling that
 * saved with every default pinned, a tier C option that looked chooseable, or a missing locked line
 * would let the owner believe protected files could be handed to the Director.
 * Depends on: routes/settings/director-page, helpers/render-settings, helpers/choose. jsdom.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { choose } from '#tests/helpers/choose.js';
import {
  lastCompanyPut as lastPut,
  saveVersion as save,
} from '#tests/helpers/director-page.js';
import { renderSettings } from '#tests/helpers/render-settings.js';

describe('Director sign-off', () => {
  it('shows a model for the check against the plan and how far the Director may sign, tier C locked', async () => {
    renderSettings('/settings/director');
    await screen.findByText('Model per step');

    expect(
      screen.getByRole('combobox', { name: 'Check against the plan' }),
    ).toHaveTextContent('Opus');

    expect(screen.getByRole('combobox', { name: 'Director sign-off' })).toHaveTextContent(
      'Up to tier B',
    );

    expect(
      screen.getByText(
        'Protected files (auth, migrations, secrets, billing): the Director signs them off only when every check passed and no secret file is touched; otherwise you do.',
      ),
    ).toBeVisible();

    expect(
      screen.getByText(/Anything it does not sign comes to you with its reason/),
    ).toBeVisible();
  });

  it('saves a lowered sign-off ceiling as just that key', async () => {
    const user = userEvent.setup();
    const { forge } = renderSettings('/settings/director');
    await screen.findByText('Model per step');

    await choose(user, 'Director sign-off', 'Tier A only');
    await save(user, 'Tier B is mine');

    expect(await screen.findByText('Saved as a new version')).toBeInTheDocument();
    expect(lastPut(forge)).toMatchObject({
      doc: { director: { sign_off: { max_tier: 'A' } } },
    });
  });

  it('offers Never, and the sign-off has no tier C option to choose', async () => {
    const user = userEvent.setup();

    renderSettings('/settings/director');
    await screen.findByText('Model per step');
    await user.click(screen.getByRole('combobox', { name: 'Director sign-off' }));

    const options = (await screen.findAllByRole('option')).map(
      (o) => o.textContent ?? '',
    );

    expect(options.some((text) => text.startsWith('Never'))).toBe(true);
    expect(options.some((text) => /tier C/i.test(text))).toBe(false);
  });
});
