/**
 * InboxAlerts: mounts the Inbox notifier and the tab-title count once for the whole shell.
 *
 * Why: the owner may be on Overview, a card or Settings when work lands in the project they
 *   are working in. Mounting here, beside the sidebar's own badge, covers every screen with
 *   one watcher and the same project the badge counts (the one in the URL, else the last
 *   used). The count in the tab title is the same figure as the sidebar badge (unread items),
 *   for that project only; there is no cheap cross-project figure.
 *
 * Exports: InboxAlerts.
 * Depends on: api/use-inbox, api/use-inbox-notifier, api/use-title-badge, api/use-projects,
 *   state/current-project.
 */

import { useInboxCounts } from '#/api/use-inbox.js';
import { useInboxNotifier } from '#/api/use-inbox-notifier.js';
import { useProjects } from '#/api/use-projects.js';
import { useTitleBadge } from '#/api/use-title-badge.js';
import { useCurrentSlug } from '#/state/current-project.js';

export function InboxAlerts() {
  const projects = useProjects();
  const slug = useCurrentSlug(projects.data) ?? '';
  const counts = useInboxCounts(slug);

  useInboxNotifier(slug);
  useTitleBadge(counts.data?.unread ?? 0);

  return null;
}
