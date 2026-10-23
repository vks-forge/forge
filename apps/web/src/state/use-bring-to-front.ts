/**
 * `useBringToFront()`: lets a link elsewhere on the page open one waiting item in the dock.
 *
 * Why: the Worker thread says "Waiting for your approval: `…`" and the dock shows only one item
 *   at a time, so a plain link to the item would land on a dock that is showing another one.
 *   The link fires a window event naming the interaction; the dock listens here, finds that
 *   item by its key and opens it, so the owner goes from the line in the thread to the exact
 *   command in one click. An event for an item that is no longer waiting does nothing.
 *
 * Exports: useBringToFront().
 * Depends on: react, domain/needs-you-dock, types/needs-you-dock.types.
 */

import { useEffect } from 'react';
import { DOCK_OPEN_EVENT, keyIsFor } from '#/domain/needs-you-dock.js';
import type { DockView } from '#/types/needs-you-dock.types.js';

/** Calls `open(key, index)` for the dock item the event names, while the dock is mounted. */
export function useBringToFront(
  views: readonly DockView[],
  open: (key: string, index: number) => void,
): void {
  useEffect(() => {
    const onOpen = (event: Event): void => {
      const id = (event as CustomEvent<{ interactionId?: string }>).detail?.interactionId;

      const at =
        id === undefined ? -1 : views.findIndex((view) => keyIsFor(view.key, id));

      const target = views[at];
      if (target !== undefined) {
        open(target.key, at);
      }
    };

    window.addEventListener(DOCK_OPEN_EVENT, onOpen);

    return () => window.removeEventListener(DOCK_OPEN_EVENT, onOpen);
  });
}
