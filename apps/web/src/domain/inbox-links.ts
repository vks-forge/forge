/**
 * Where an inbox item leads and what to call its kind.
 *
 * Why: an inbox row is a pointer, not a destination. A Worker's question belongs to a ticket,
 *   a failed gate to a run, a memory proposal to Memory, a quota wait to its harness. One
 *   function picks the target so every row, on Home and in the Inbox, leads to the same place,
 *   and a kind the UI does not know yet still opens something sensible (the ticket or run it
 *   names, else the Inbox itself) rather than a dead link. A tool approval or a compatibility
 *   check opens the one harness it names, scrolled to the section where the owner decides
 *   (`#tools`, `#compat`), so "Review tool" lands on the Approve button, not a generic list.
 *
 * Exports: INBOX_KIND_LABEL, inboxLink().
 * Depends on: @forge/core (parseInboxItemId, types), domain/nav-entries. Pure.
 */

import { parseInboxItemId } from '@forge/core';
import type { InboxItem, InboxKind } from '@forge/core';
import { projectPath, settingsPath } from '#/domain/nav-entries.js';
import { ticketPath } from '#/domain/ticket-paths.js';

export const INBOX_KIND_LABEL: Readonly<Record<InboxKind, string>> = {
  question: 'Question',
  ticket_review: 'Review',
  ticket_signoff: 'Sign-off',
  ticket_waiting: 'Waiting',
  gate_failed: 'Gate failed',
  run_interrupted: 'Run interrupted',
  quota_wait: 'Quota wait',
  harness_compat: 'Harness check',
  tool_approval: 'Tool approval',
  memory_proposal: 'Memory proposal',
};

/** The harness kind named by a `<kind>/<version>[/<tool>]` source id, URI-encoded. */
function harnessSegment(source: string | undefined): string | undefined {
  const kind = source?.split('/')[0];

  return kind ? encodeURIComponent(kind) : undefined;
}

/** The route an item opens, and what that route is called on the link. */
export function inboxLink(
  slug: string,
  item: Pick<InboxItem, 'id' | 'kind' | 'run_id' | 'ticket_id'>,
): { to: string; label: string } {
  const source = parseInboxItemId(item.id)?.sourceId;

  if (item.kind === 'memory_proposal' && source) {
    return {
      to: `${projectPath(slug, 'memory')}?record=${encodeURIComponent(source)}`,
      label: 'Open in Memory',
    };
  }

  if (item.kind === 'quota_wait' && source) {
    return {
      to: settingsPath(`harnesses/${encodeURIComponent(source)}`),
      label: 'Open harness',
    };
  }

  if (item.kind === 'tool_approval' || item.kind === 'harness_compat') {
    const kind = harnessSegment(source);
    const tool = item.kind === 'tool_approval';

    if (kind) {
      return {
        to: `${settingsPath(`harnesses/${kind}`)}#${tool ? 'tools' : 'compat'}`,
        label: tool ? 'Review tool' : 'Open check',
      };
    }

    return { to: settingsPath('harnesses'), label: 'Open harnesses' };
  }

  if (item.run_id && (item.kind === 'gate_failed' || item.kind === 'run_interrupted')) {
    return {
      to: `${projectPath(slug, 'runs')}?run=${encodeURIComponent(item.run_id)}`,
      label: 'Open run',
    };
  }

  if (item.ticket_id) {
    return {
      to: ticketPath(slug, item.ticket_id),
      label: 'Open ticket',
    };
  }

  return { to: projectPath(slug, 'inbox'), label: 'Open inbox' };
}
