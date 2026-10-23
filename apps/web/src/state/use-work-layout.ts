/**
 * `useWorkLayoutMode()`: which frame the Card and Ticket pages use at this width.
 *
 * Why: the chat is always the main column, but where Plan, Tickets and Details live depends on
 *   room: beside the chat from 1280 px, as tabs above it from 1024 to 1279 px, and as a
 *   full-screen sheet opened from the header below 1024 px. CSS cannot swap the markup (the
 *   rail, the tabs and the sheet are different trees with different focus rules), so the page
 *   reads the width here. Without `matchMedia` (tests) no query matches, which reads as the
 *   middle layout, the tabbed one.
 *
 * Exports: useWorkLayoutMode(), useIsPhone().
 * Depends on: state/use-media-query, types/needs-you-dock.types.
 */

import { useMediaQuery } from '#/state/use-media-query.js';
import type { WorkLayoutMode } from '#/types/needs-you-dock.types.js';

export function useWorkLayoutMode(): WorkLayoutMode {
  const rail = useMediaQuery('(min-width: 1280px)');
  const sheet = useMediaQuery('(max-width: 1023px)');

  return rail ? 'rail' : sheet ? 'sheet' : 'tabs';
}

/** Phones: the dock folds to one line while the message box has focus. */
export function useIsPhone(): boolean {
  return useMediaQuery('(max-width: 767px)');
}
