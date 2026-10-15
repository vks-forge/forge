/**
 * Inbox shapes that are not API bodies: a derived item before marks, and a mark action.
 *
 * Why: the server derives items from source rows and only then applies the owner's read and
 *   archive marks (core `applyInboxMarks`). Naming the pre-mark shape and the four mark
 *   actions lets the derivation, the rules and the routes agree without a hand-written copy.
 *
 * Exports: InboxCandidate, InboxMark.
 * Depends on: schemas/inbox. Types only.
 */

import type { InboxItem } from '#/schemas/inbox.js';

/** An item as derived from its source, before the person's marks are applied. */
export type InboxCandidate = Omit<InboxItem, 'read' | 'archived'>;

export type InboxMark = 'read' | 'unread' | 'archive' | 'unarchive';
