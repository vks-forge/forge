/**
 * InboxReadAll: the "Mark all read" bar above the Notices and Unread lists.
 *
 * Why: news (budget warnings, failed gates, interrupted runs) piles up, and clearing ten of them
 *   one click at a time is the chore this bar removes. One click marks the whole view read on the
 *   server (so it also covers items below "Load more"), then a short notice says how many
 *   ("Marked 5 read"). It asks no confirmation because it is reversible (each item can be marked
 *   unread). If the server refuses, a plain message says nothing changed, so the owner never
 *   believes news was cleared when it was not.
 *
 * Exports: InboxReadAll.
 * Depends on: api/use-inbox, api/describe-error, components/ui/button, state/notify.
 */

import { describeError } from '#/api/describe-error.js';
import { useMarkAllRead } from '#/api/use-inbox.js';
import { Button } from '#/components/ui/button.js';
import { useNotify } from '#/state/notify/notify-context.js';
import type { InboxReadAllView } from '#/types/work-api.types.js';

const READ_ALL_NOTICE = 'inbox-read-all';

const BLURB: Readonly<Record<InboxReadAllView, string>> = {
  notices: 'News that needs no decision from you.',
  unread: 'Everything you have not read yet.',
};

export function InboxReadAll(props: {
  slug: string;
  view: InboxReadAllView;
  /** Marking is paused while offline. */
  online: boolean;
}) {
  const readAll = useMarkAllRead(props.slug);
  const notify = useNotify();

  async function run(): Promise<void> {
    notify.dismiss(READ_ALL_NOTICE);

    try {
      const { marked } = await readAll.mutateAsync(props.view);
      notify.success(`Marked ${marked} read`, { id: READ_ALL_NOTICE });
    } catch (error) {
      const { detail } = describeError(error);
      notify.error('Could not mark them read', {
        id: READ_ALL_NOTICE,
        description: `Nothing was changed. ${detail}`,
      });
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted">{BLURB[props.view]}</p>
      <Button
        disabled={!props.online}
        status={readAll.isPending ? 'loading' : 'idle'}
        onClick={() => void run()}
      >
        Mark all read
      </Button>
    </div>
  );
}
