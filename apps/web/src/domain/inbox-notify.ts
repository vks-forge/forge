/**
 * Rules for telling the owner about a new Inbox item.
 *
 * Why: the Inbox is where work waits on the owner, so a new item should reach them without a
 *   reload, but never twice and never as a flood on opening a project. These pure rules decide
 *   which items are new (needs the owner, not archived, id not yet seen), when a desktop
 *   notification may fire (only for a hidden tab, only if the owner switched it on and the
 *   browser allows it) and how the unread count is written in front of whatever title the page
 *   set, so the tab shows "(3) Inbox · Forge" and the count vanishes at zero.
 *
 * Exports: newInboxItems(), mayNotifyBrowser(), titleWithBadge(), parseSeenIds().
 * Depends on: @forge/core (types), types/inbox-notify. Pure.
 */

import type { InboxItem } from '@forge/core';
import type { BrowserPermission } from '#/types/inbox-notify.types.js';

const BADGE_PREFIX = /^\(\d+\) /;

/** Items that wait on the owner and have not been announced yet, oldest first. */
export function newInboxItems(
  items: readonly InboxItem[],
  seen: ReadonlySet<string>,
): InboxItem[] {
  return items
    .filter((item) => item.needs_action && !item.archived && !seen.has(item.id))
    .reverse();
}

/** A desktop notification needs a hidden tab, the owner's yes, and the browser's yes. */
export function mayNotifyBrowser(state: {
  hidden: boolean;
  enabled: boolean;
  permission: BrowserPermission;
}): boolean {
  return state.hidden && state.enabled && state.permission === 'granted';
}

/** `title` with a single `(n) ` prefix when `count` > 0, and none otherwise. */
export function titleWithBadge(title: string, count: number): string {
  const bare = title.replace(BADGE_PREFIX, '');

  return count > 0 ? `(${count}) ${bare}` : bare;
}

/** The ids saved in session storage; anything that is not a list of strings is forgotten. */
export function parseSeenIds(raw: string | null): string[] {
  try {
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}
