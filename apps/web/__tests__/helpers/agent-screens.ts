/**
 * Helpers for the agent screen tests: open a menu entry, save with a reason, read what was sent.
 *
 * Why: every agent test ends the same way (type a reason, press save, check exactly which body went
 * to which path), and starts the same way (open the New agent menu, pick a way in). Keeping those
 * steps here keeps each test about the behaviour it pins, and makes "what was sent" read the same
 * everywhere.
 *
 * Exports: pickMenu(), saveAgent(), bodiesTo(), openEditor(), rowOf, REVIEWER_ROW.
 * Depends on: @testing-library/react, @testing-library/user-event, helpers/render-settings.
 */

import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import type { FakeForge } from '#tests/helpers/fake-forge/fake-forge.js';

/** Opens the menu button called `button` and clicks its entry `item`. */
export async function pickMenu(
  user: UserEvent,
  button: string | RegExp,
  item: string | RegExp,
): Promise<void> {
  await user.click(await screen.findByRole('button', { name: button }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

/** Types a reason and presses the save bar's button. */
export async function saveAgent(
  user: UserEvent,
  label: string | RegExp = 'Save agent',
  reason = 'for the test',
): Promise<void> {
  await user.type(await screen.findByLabelText('Reason for this change'), reason);
  await user.click(screen.getByRole('button', { name: label }));
}

/** The bodies of every call to exactly `METHOD path`, oldest first. */
export function bodiesTo(forge: FakeForge, method: string, path: string): unknown[] {
  return forge.stub.calls
    .filter((c) => c.method === method && c.path === path)
    .map((c) => c.body);
}

/** The roster row (a list item) of the agent called `name`. */
export async function rowOf(name: string): Promise<HTMLElement> {
  const roster = await screen.findByRole('list', { name: 'Agent roster' });
  const heading = within(roster).getByRole('heading', { name, level: 3 });

  return heading.closest('li') as HTMLElement;
}

export const REVIEWER_ROW = 'Reviewer';

/** Opens the editor of `name` from the roster. */
export async function openEditor(user: UserEvent, name: string): Promise<void> {
  const row = await rowOf(name);
  const button = within(row)
    .getAllByRole('button')
    .find((b) => /^(Edit|Override)/.test(b.textContent ?? ''));

  await user.click(button as HTMLElement);
  await screen.findByRole('heading', { name, level: 2 });
}
