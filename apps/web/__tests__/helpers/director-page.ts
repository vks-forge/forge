/**
 * Helpers for the Director screen tests: fill the save panel, read the last settings write.
 *
 * Why: every Director test ends the same way, by saving a version with a name and a reason
 *   and then checking exactly which document went to the server. Keeping those two steps in one
 *   place keeps each test about the behaviour it pins, and makes "what was sent" read the
 *   same everywhere.
 *
 * Exports: saveVersion(), lastCompanyPut().
 * Depends on: @testing-library/react, @testing-library/user-event, helpers/render-settings.
 */

import { screen, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import type { renderSettings } from '#tests/helpers/render-settings.js';

type User = ReturnType<typeof userEvent.setup>;

/** Fills the save panel (name and reason) and presses the button called `label`. */
export async function saveVersion(
  user: User,
  reason: string,
  label = 'Save as version 3',
): Promise<void> {
  const form = await screen.findByRole('form', { name: 'Save settings' });
  const name = within(form).getByLabelText('Your name');
  await user.clear(name);
  await user.type(name, 'Vik');
  await user.type(within(form).getByLabelText('Why you are changing it'), reason);
  await user.click(within(form).getByRole('button', { name: label }));
}

/** The body of the newest `PUT /settings/company`. */
export function lastCompanyPut(forge: ReturnType<typeof renderSettings>['forge']): {
  doc: Record<string, unknown>;
  expectedVersion: number;
} {
  return (forge.stub.callsTo('PUT /settings/company').at(-1)?.body ?? {}) as {
    doc: Record<string, unknown>;
    expectedVersion: number;
  };
}
