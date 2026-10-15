/**
 * InboxPage: everything in a project that needs the user or has news, in one list.
 *
 * Why: a Worker's question, a ticket waiting for review, a failed gate or a harness out of
 *   quota each live on a different screen; the owner should not have to patrol them. The
 *   Inbox gathers them (d-0116), opens on "Needs action", and lets the owner clear them fast:
 *   mark read or archive with one click, instantly (the list answers before the server does),
 *   with a few seconds to Undo an archive and a plain message if the server refuses, in which
 *   case the item is put back. Items whose source changes resurface as unread, so archiving
 *   never hides something that has since moved. Long histories load 50 at a time and are
 *   windowed. Loading, empty, error and offline each have their own state.
 *
 * Exports: InboxPage.
 * Depends on: react, react-router, api/*, components/*, routes/inbox/*, state/*.
 */

import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import type { InboxItem } from '@forge/core';
import { describeError } from '#/api/describe-error.js';
import { useInboxCounts, useInboxList, useMarkInbox } from '#/api/use-inbox.js';
import { OfflineNotice } from '#/components/status/offline-notice.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { Button } from '#/components/ui/button.js';
import { Toast } from '#/components/ui/toast.js';
import { WindowedList } from '#/components/ui/windowed-list.js';
import { undoOf } from '#/domain/inbox-marks.js';
import { InboxRow, INBOX_ROW_HEIGHT } from '#/routes/inbox/inbox-row.js';
import { INBOX_VIEW_LABEL, InboxTabs } from '#/routes/inbox/inbox-tabs.js';
import { useInboxPrefs } from '#/state/use-inbox-prefs.js';
import { useOnline } from '#/state/use-online.js';
import type { InboxMarkName } from '#/types/work-api.types.js';
import type { ToastState } from '#/types/work-ui.types.js';

const EMPTY_HINT = {
  needs_action:
    'When a Worker asks a question or a ticket waits for your review, it appears here.',
  unread: 'Everything new has been read.',
  all: 'Questions, reviews and alerts from this project appear here.',
  archived:
    'Items you archive are kept here. They come back on their own if their source changes.',
} as const;

const MARK_VERB: Readonly<Record<InboxMarkName, string>> = {
  read: 'mark it read',
  unread: 'mark it unread',
  archive: 'archive it',
  unarchive: 'unarchive it',
};

export function InboxPage() {
  const { slug = '' } = useParams();
  const online = useOnline();
  const { view, setView } = useInboxPrefs();
  const counts = useInboxCounts(slug);
  const list = useInboxList(slug, view);
  const marks = useMarkInbox(slug);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    document.title = 'Inbox · Forge';
  }, []);

  const dismiss = useCallback(() => setToast(null), []);

  async function mark(item: InboxItem, name: InboxMarkName): Promise<void> {
    setToast(null);

    try {
      await marks.mutateAsync({ itemId: item.id, mark: name });
    } catch (error) {
      const { detail } = describeError(error);
      setToast({
        tone: 'error',
        message: `Could not ${MARK_VERB[name]}, so “${item.title}” was put back. ${detail}`,
      });

      return;
    }

    if (name === 'archive') {
      setToast({
        tone: 'info',
        message: `Archived “${item.title}”.`,
        undo: () => void mark(item, undoOf(name)),
      });
    }
  }

  if (list.isPending) {
    return <StatePanel kind="loading" label="Loading inbox" />;
  }

  if (list.isError && !list.data) {
    const { title, detail } = describeError(list.error);

    return (
      <StatePanel
        kind="error"
        title={title}
        detail={detail}
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
      />
    );
  }

  const items = (list.data?.pages ?? []).flatMap((page) => page.items);

  return (
    <section className="grid max-w-4xl gap-4">
      <header className="grid gap-1">
        <p className="font-data text-xs text-muted">{slug}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="max-w-prose text-sm text-muted">
          What needs you, and what changed. Archived items come back if their source
          moves.
        </p>
      </header>

      <OfflineNotice>
        You are offline. You can read what is loaded; marking items is paused.
      </OfflineNotice>

      <InboxTabs view={view} counts={counts.data} onChange={setView} />

      <div
        id="inbox-panel"
        role="tabpanel"
        aria-labelledby={`inbox-tab-${view}`}
        className="grid gap-3"
      >
        {items.length === 0 ? (
          <StatePanel kind="empty" title={`Nothing in ${INBOX_VIEW_LABEL[view]}`}>
            {EMPTY_HINT[view]}
          </StatePanel>
        ) : (
          <WindowedList
            items={items}
            rowHeight={INBOX_ROW_HEIGHT}
            label={INBOX_VIEW_LABEL[view]}
            keyOf={(item) => item.id}
            renderRow={(item) => (
              <InboxRow
                slug={slug}
                item={item}
                onMark={(target, name) => void mark(target, name)}
                marksDisabled={!online}
              />
            )}
          />
        )}

        {list.hasNextPage ? (
          <div className="flex items-center gap-3">
            <Button
              onClick={() => void list.fetchNextPage()}
              status={list.isFetchingNextPage ? 'loading' : 'idle'}
            >
              Load more
            </Button>
            <span className="text-xs text-muted">Showing {items.length}</span>
          </div>
        ) : null}
        {list.isFetchNextPageError ? (
          <p role="alert" className="text-sm text-danger">
            Could not load more. Check that Forge is running and try again.
          </p>
        ) : null}
      </div>

      <AnimatePresence>
        {toast ? (
          <Toast
            key={toast.message}
            tone={toast.tone}
            message={toast.message}
            {...(toast.undo ? { actionLabel: 'Undo', onAction: toast.undo } : {})}
            onDismiss={dismiss}
          />
        ) : null}
      </AnimatePresence>
    </section>
  );
}
