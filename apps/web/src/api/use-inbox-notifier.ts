/**
 * `useInboxNotifier()`: tells the owner when a new item lands in the open project's Inbox.
 *
 * Why: Forge works while the owner is elsewhere, and the Inbox is where it waits for them.
 *   Watching the newest needs-you items (refetched whenever the project stream invalidates
 *   the inbox, and polled every 30 s as a fallback) lets a new one raise a toast with an Open
 *   button, refresh the sidebar badge at once, and, if the owner allowed it and the tab is
 *   hidden, a desktop notification. The first fetch of a project only seeds the "seen" set so
 *   opening a project never floods the screen with old items; ids are also remembered for the
 *   session so a reload does not repeat them. Toasts reuse the app's single notification
 *   stack, keyed by item id, so one item can never show twice.
 *
 * Exports: useInboxNotifier(), browserPermission(), INBOX_WATCH_LIMIT.
 * Depends on: react, react-router, @tanstack/react-query, api/use-inbox, domain/inbox-links,
 *   domain/inbox-notify, state/inbox-seen, state/notify-prefs, state/notify/notify-store.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import type { NavigateFunction } from 'react-router';
import type { InboxItem } from '@forge/core';
import { INBOX_COUNTS_MS, useInboxPreview } from '#/api/use-inbox.js';
import { INBOX_KIND_LABEL, inboxLink } from '#/domain/inbox-links.js';
import { mayNotifyBrowser, newInboxItems } from '#/domain/inbox-notify.js';
import { readSeen, writeSeen } from '#/state/inbox-seen.js';
import { notifyPrefsStore } from '#/state/notify-prefs.js';
import { notifyStore } from '#/state/notify/notify-store.js';
import type { BrowserPermission } from '#/types/inbox-notify.types.js';

export const INBOX_WATCH_LIMIT = 20;
const TOAST_MS = 10_000;

export function browserPermission(): BrowserPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

function desktopNotice(item: InboxItem, slug: string, open: () => void): void {
  const allowed = mayNotifyBrowser({
    hidden: document.visibilityState === 'hidden',
    enabled: notifyPrefsStore.getState().browser,
    permission: browserPermission(),
  });

  if (!allowed) {
    return;
  }

  try {
    const note = new Notification(item.title, {
      body: `${slug} · ${INBOX_KIND_LABEL[item.kind]}`,
      tag: item.id,
    });

    note.onclick = () => {
      window.focus();
      open();
      note.close();
    };
  } catch {
    // Some browsers refuse `new Notification` (e.g. Android Chrome); the toast still shows.
  }
}

function announce(item: InboxItem, slug: string, navigate: NavigateFunction): void {
  const { to } = inboxLink(slug, item);
  const open = (): void => void navigate(to);

  notifyStore.info(item.title, {
    id: `inbox:${slug}:${item.id}`,
    description: `${slug} · ${INBOX_KIND_LABEL[item.kind]}`,
    duration: TOAST_MS,
    action: { label: 'Open', onClick: open },
  });

  desktopNotice(item, slug, open);
}

export function useInboxNotifier(slug: string): void {
  const query = useInboxPreview(slug, INBOX_WATCH_LIMIT, { pollMs: INBOX_COUNTS_MS });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // The project the seen set belongs to; empty until its first fetch has seeded it.
  const seeded = useRef<{ slug: string; seen: Set<string> } | null>(null);
  const items = query.data?.items;

  useEffect(() => {
    if (!items) {
      return;
    }

    if (seeded.current?.slug !== slug) {
      const seen = readSeen(slug);

      for (const item of items) {
        seen.add(item.id);
      }

      seeded.current = { slug, seen };
      writeSeen(slug, seen);

      return;
    }

    const { seen } = seeded.current;
    const fresh = newInboxItems(items, seen);

    if (fresh.length === 0) {
      return;
    }

    for (const item of fresh) {
      seen.add(item.id);
      announce(item, slug, navigate);
    }

    writeSeen(slug, seen);
    // The badge reads the counts query; do not wait for its 30 s poll.
    void queryClient.invalidateQueries({ queryKey: ['inbox', slug, 'counts'] });
  }, [items, slug, navigate, queryClient]);
}
