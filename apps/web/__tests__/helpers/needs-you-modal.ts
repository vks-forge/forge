/**
 * Test helper: open the needs-you modal from the alert under the page title.
 *
 * Why: waiting items live in a modal the owner opens on purpose, so every test that acts on one
 *   starts the way the owner does: press Open, then work inside the list that appears.
 *
 * Exports: openNeedsYou(), NO_NEEDS_YOU.
 * Depends on: @testing-library/react (screen), @testing-library/user-event (type).
 */

import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** The alert's button; absent when nothing waits on the owner. */
export const NO_NEEDS_YOU = { name: 'Open' } as const;

/** Presses Open and returns the modal's list of waiting items. */
export async function openNeedsYou(
  user: UserEvent,
  name: string | RegExp = /Waiting on you/,
): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', NO_NEEDS_YOU));

  return screen.findByRole('region', { name });
}
