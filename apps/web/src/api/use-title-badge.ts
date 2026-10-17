/**
 * `useTitleBadge()`: puts the unread count in front of the page title, "(3) Inbox · Forge".
 *
 * Why: the owner leaves Forge in a background tab; the tab title is the one thing they still
 *   see. Fourteen screens set `document.title` themselves, so instead of touching each, one
 *   observer watches the title and keeps a single `(n) ` prefix on whatever the page wrote,
 *   and removes it at zero or when the shell unmounts.
 *
 * Exports: useTitleBadge().
 * Depends on: react, domain/inbox-notify. IO: document.title, MutationObserver.
 */

import { useEffect } from 'react';
import { titleWithBadge } from '#/domain/inbox-notify.js';

export function useTitleBadge(count: number): void {
  useEffect(() => {
    const apply = (): void => {
      const next = titleWithBadge(document.title, count);

      // Writing only on a difference ends the observer loop after one round.
      if (next !== document.title) {
        document.title = next;
      }
    };

    apply();

    const observer = new MutationObserver(apply);

    observer.observe(document.head, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      document.title = titleWithBadge(document.title, 0);
    };
  }, [count]);
}
