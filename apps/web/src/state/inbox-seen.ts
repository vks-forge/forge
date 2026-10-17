/**
 * The Inbox items already announced in this browser session, per project.
 *
 * Why: a reload must not announce the same waiting item again, but a new tab session starts
 *   fresh. Session storage gives exactly that lifetime. Storage can be blocked or full, and a
 *   notification nicety must never crash the app, so every access is guarded: a failed read
 *   means "nothing seen" and a failed write means dedupe holds for this page load only.
 *
 * Exports: readSeen(), writeSeen().
 * Depends on: domain/inbox-notify. IO: sessionStorage (guarded).
 */

import { parseSeenIds } from '#/domain/inbox-notify.js';

const key = (slug: string): string => `forge.session.inbox-seen.${slug}`;
const MAX_KEPT = 500;

export function readSeen(slug: string): Set<string> {
  try {
    return new Set(parseSeenIds(sessionStorage.getItem(key(slug))));
  } catch {
    return new Set();
  }
}

export function writeSeen(slug: string, seen: ReadonlySet<string>): void {
  try {
    sessionStorage.setItem(key(slug), JSON.stringify([...seen].slice(-MAX_KEPT)));
  } catch {
    // Dedupe still holds in memory for this page load.
  }
}
