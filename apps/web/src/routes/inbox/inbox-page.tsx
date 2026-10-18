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
 *   windowed. A ticket waiting on the owner has a "Respond" button that opens its escalation card
 *   in a drawer (rows are fixed-height for the windowed list, so the card does not grow the row);
 *   acting settles the card, the chat and the Ticket page. A Director pipeline suggestion has "Review", which
 *   opens the change and its evidence in a drawer to accept or reject. A budget warning has
 *   "Acknowledge" (archive) and "Change cap" (a drawer with the card's cap box). Loading, empty, error and offline each
 *   have their own state.
 *
 * Exports: InboxPage.
 * Depends on: react, react-router, api/*, components/* (incl. the escalation card), routes/inbox/*,
 *   state/* (notify).
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import type { InboxItem } from '@forge/core';
import { describeError } from '#/api/describe-error.js';
import { useInboxCounts, useInboxList, useMarkInbox } from '#/api/use-inbox.js';
import { EscalationCard } from '#/components/escalation/escalation-card.js';
import { OfflineNotice } from '#/components/status/offline-notice.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { Button } from '#/components/ui/button.js';
import { SideDrawer } from '#/components/ui/side-drawer.js';
import { WindowedList } from '#/components/ui/windowed-list.js';
import { undoOf } from '#/domain/inbox-marks.js';
import { budgetCardId } from '#/domain/inbox-links.js';
import { InboxBudget } from '#/routes/inbox/inbox-budget.js';
import { InboxProposal } from '#/routes/inbox/inbox-proposal.js';
import { InboxRow, INBOX_ROW_HEIGHT } from '#/routes/inbox/inbox-row.js';
import { INBOX_VIEW_LABEL, InboxTabs } from '#/routes/inbox/inbox-tabs.js';
import { useNotify } from '#/state/notify/notify-context.js';
import { useInboxPrefs } from '#/state/use-inbox-prefs.js';
import { useOnline } from '#/state/use-online.js';
import type { InboxMarkName } from '#/types/work-api.types.js';
import { Inbox as InboxIcon } from 'lucide-react';

const EMPTY_HINT = {
  needs_action:
    'When a Worker asks a question or a ticket waits for your review, it appears here.',
  unread: 'Everything new has been read.',
  all: 'Questions, reviews and alerts from this project appear here.',
  archived:
    'Items you archive are kept here. They come back on their own if their source changes.',
} as const;

const ARCHIVE_NOTICE = 'inbox-archive';

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
  const notify = useNotify();
  // The item being answered, kept whole so the card survives the list dropping it once settled.
  const [responding, setResponding] = useState<InboxItem | null>(null);
  // The Director's pipeline suggestion being decided, in its own drawer.
  const [reviewing, setReviewing] = useState<InboxItem | null>(null);
  // The budget warning whose cap is being changed, in its own drawer.
  const [capping, setCapping] = useState<InboxItem | null>(null);

  useEffect(() => {
    document.title = 'Inbox · Forge';
  }, []);

  async function mark(item: InboxItem, name: InboxMarkName): Promise<void> {
    notify.dismiss(ARCHIVE_NOTICE);

    try {
      await marks.mutateAsync({ itemId: item.id, mark: name });
    } catch (error) {
      const { detail } = describeError(error);
      notify.error(`Could not ${MARK_VERB[name]}`, {
        id: ARCHIVE_NOTICE,
        description: `“${item.title}” was put back. ${detail}`,
      });

      return;
    }

    if (name === 'archive') {
      notify.success(`Archived “${item.title}”`, {
        id: ARCHIVE_NOTICE,
        duration: 8000,
        action: { label: 'Undo', onClick: () => void mark(item, undoOf(name)) },
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
    <section className="grid gap-4">
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
          <StatePanel
            kind="empty"
            icon={InboxIcon}
            title={`Nothing in ${INBOX_VIEW_LABEL[view]}`}
          >
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
                onRespond={setResponding}
                onReview={setReviewing}
                onChangeCap={setCapping}
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

      <SideDrawer
        open={responding !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResponding(null);
          }
        }}
        title={responding?.title ?? 'Waiting on you'}
        {...(responding?.ticket_id ? { eyebrow: responding.ticket_id } : {})}
      >
        {responding?.escalation ? (
          <EscalationCard
            key={responding.escalation.id}
            view={
              items.find((item) => item.id === responding.id)?.escalation ??
              responding.escalation
            }
            variant="plain"
            showTicket={false}
          />
        ) : null}
      </SideDrawer>

      <SideDrawer
        open={reviewing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReviewing(null);
          }
        }}
        title={reviewing?.title ?? 'Pipeline change'}
        eyebrow="Director suggestion"
      >
        {reviewing ? (
          <InboxProposal key={reviewing.id} slug={slug} itemId={reviewing.id} />
        ) : null}
      </SideDrawer>

      <SideDrawer
        open={capping !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCapping(null);
          }
        }}
        title="Change the budget cap"
        {...(capping ? { eyebrow: capping.title } : {})}
      >
        {capping && budgetCardId(capping) ? (
          <InboxBudget
            key={capping.id}
            cardId={budgetCardId(capping) ?? ''}
            onDone={() => setCapping(null)}
          />
        ) : null}
      </SideDrawer>
    </section>
  );
}
