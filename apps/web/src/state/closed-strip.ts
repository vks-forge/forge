/**
 * `useClosedStrip()`: whether a Board view's last column is expanded this session.
 *
 * Why: the "Closed" columns (closed cards, blocked and cancelled tickets) are history, not
 *   work, so the Board folds each into a narrow strip with its count and gives the screen to
 *   the columns that need attention. Once the user opens one they want it to stay open while
 *   they move around the app, but a fresh visit should start tidy again, so the choice lives
 *   for the tab only (a transient store) and is kept per view.
 *
 * Exports: useClosedStrip(), closedStripStore.
 * Depends on: state/create-transient-store. No IO.
 */

import { createTransientStore } from '#/state/create-transient-store.js';

export const closedStripStore = createTransientStore<{
  open: Readonly<Record<string, boolean>>;
}>({ open: {} });

/** `view` names the Board view ('cards' or 'tickets'); each remembers its own strip. */
export function useClosedStrip(view: string): {
  expanded: boolean;
  setExpanded: (next: boolean) => void;
} {
  const expanded = closedStripStore((s) => s.open[view] === true);

  return {
    expanded,
    setExpanded: (next) =>
      closedStripStore.setState((s) => ({ open: { ...s.open, [view]: next } })),
  };
}
