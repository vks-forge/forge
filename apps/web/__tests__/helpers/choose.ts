/**
 * `choose()` and `chosen()`: drive the shared Picker the way a user does.
 *
 * Why: the Picker replaced every native select, so tests can no longer call `selectOptions`.
 *   A user opens the dropdown with a click and clicks a row; doing the same in tests keeps them
 *   honest about what is on screen (the row must exist and be enabled) and puts the two-step
 *   dance in one place instead of repeating it in every screen test.
 *
 * Exports: choose(), chosen().
 * Depends on: @testing-library/react, @testing-library/user-event.
 */

import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Opens the Picker called `name` and clicks the option labelled `optionLabel`. */
export async function choose(
  user: UserEvent,
  name: string | RegExp,
  optionLabel: string | RegExp,
): Promise<void> {
  await user.click(await screen.findByRole('combobox', { name }));
  await user.click(await screen.findByRole('option', { name: optionLabel }));
}

/** The text a Picker's trigger currently shows. */
export function chosen(name: string | RegExp): string {
  return screen.getByRole('combobox', { name }).textContent ?? '';
}
