/**
 * MemoryPage: a project's decisions, rejected approaches, proposals and outcomes.
 *
 * Why: memory is what the Director plans against, and the Director may only propose, never
 *   decide (d-0007). This screen is where the owner reads what binds the Director and answers
 *   what it proposes. Proposals are the one thing that waits on the user, so the screen opens
 *   on them when any exist. Answering is optimistic with rollback, behind a confirm because the
 *   API has no undo; a refusal (already answered elsewhere, Forge down, offline) puts the list
 *   back and says why in words. The open record is held in the URL (`?record=d-0003`) so a
 *   link or Back returns to it. Loading, empty, error and offline all have their own state.
 *
 * Exports: MemoryPage.
 * Depends on: react, react-router, api/*, components/*, domain/memory-filter, state/*.
 */

import { CircleAlert, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useAnswerProposal, useMemoryList } from '#/api/use-memory.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { Button } from '#/components/ui/button.js';
import { WindowedList } from '#/components/ui/windowed-list.js';
import { countByTab, filterEntries, tagsOf } from '#/domain/memory-filter.js';
import { ApproveDialog, RejectDialog } from '#/routes/memory/answer-dialogs.js';
import { MEMORY_ROW_HEIGHT, MemoryRow } from '#/routes/memory/memory-row.js';
import { MemoryTabs, TAB_LABELS } from '#/routes/memory/memory-tabs.js';
import { MemoryToolbar } from '#/routes/memory/memory-toolbar.js';
import { RecordDrawer } from '#/routes/memory/record-drawer.js';
import { useNotify } from '#/state/notify/notify-context.js';
import { useMemoryPrefs } from '#/state/use-memory-prefs.js';
import { useOnline } from '#/state/use-online.js';

const EMPTY_HINT = {
  decisions: 'Decisions you make, and proposals you approve, appear here.',
  rejected: 'Approaches you reject appear here, with your reason.',
  proposals: 'When the Director infers something about this project it proposes it here.',
  outcomes:
    'Outcomes of finished tickets appear here. The Forge server does not list them yet.',
} as const;

export function MemoryPage() {
  const { slug = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const online = useOnline();
  const list = useMemoryList(slug);
  const answer = useAnswerProposal(slug);
  const entries = list.data ?? [];
  const counts = countByTab(entries);
  const { filter, setFilter } = useMemoryPrefs(
    counts.proposals > 0 ? 'proposals' : 'decisions',
  );

  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const notify = useNotify();
  const recordId = params.get('record');

  useEffect(() => {
    document.title = 'Memory · Forge';
  }, []);

  const openRecord = (id: string | null): void =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (id) {
          next.set('record', id);
        } else {
          next.delete('record');
        }

        return next;
      },
      { replace: false },
    );

  const statementOf = (id: string | null): string | null =>
    id === null ? null : (entries.find((e) => e.id === id)?.statement ?? id);

  function send(body: Parameters<typeof answer.mutate>[0]): void {
    answer.mutate(body, {
      onSuccess: () =>
        body.verdict === 'approve'
          ? notify.success(`${body.id} approved`, {
              description: 'It is now a decision.',
            })
          : notify.success(`${body.id} rejected`, {
              description: 'The rejection is recorded.',
            }),
    });
  }

  if (list.isPending) {
    return <StatePanel kind="loading" label="Loading memory" />;
  }

  if (list.isError) {
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

  const shown = filterEntries(entries, filter);
  const tabTotal = counts[filter.tab];

  return (
    <section className="grid gap-4">
      <header className="grid gap-1">
        <p className="font-data text-xs text-muted">{slug}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Memory</h1>
        <p className="max-w-prose text-sm text-muted">
          What the Director must follow on this project, what you ruled out, and what it
          proposes. Only you can approve a proposal.
        </p>
      </header>

      {!online ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-hover px-3 py-2 text-sm"
        >
          <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          You are offline. You can read what is loaded; answering proposals is paused.
        </p>
      ) : null}

      {answer.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            Not saved, the list was put back.{' '}
            {answer.error instanceof Error ? describeError(answer.error).detail : ''}
          </span>
          <Button variant="quiet" onClick={() => answer.reset()}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <MemoryTabs
        tab={filter.tab}
        counts={counts}
        onChange={(tab) => setFilter({ ...filter, tab })}
      />

      <div
        id="memory-panel"
        role="tabpanel"
        aria-labelledby={`memory-tab-${filter.tab}`}
        className="grid gap-4"
      >
        <MemoryToolbar
          filter={filter}
          tags={tagsOf(entries, filter.tab)}
          shown={shown.length}
          total={tabTotal}
          onChange={setFilter}
        />

        {tabTotal === 0 ? (
          <StatePanel
            kind="empty"
            title={`No ${TAB_LABELS[filter.tab].toLowerCase()} yet`}
          >
            {EMPTY_HINT[filter.tab]}
          </StatePanel>
        ) : shown.length === 0 ? (
          <StatePanel kind="empty" title="Nothing matches">
            Try fewer words, or clear the filters.
          </StatePanel>
        ) : (
          <WindowedList
            items={shown}
            rowHeight={MEMORY_ROW_HEIGHT}
            label={TAB_LABELS[filter.tab]}
            keyOf={(entry) => entry.id}
            renderRow={(entry) => (
              <MemoryRow
                entry={entry}
                onOpen={openRecord}
                onApprove={setApproving}
                onReject={setRejecting}
                answersDisabled={!online}
              />
            )}
          />
        )}
      </div>

      <RecordDrawer
        slug={slug}
        id={recordId}
        onOpen={openRecord}
        onClose={() => openRecord(null)}
        onApprove={setApproving}
        onReject={setRejecting}
        answersDisabled={!online}
      />
      <ApproveDialog
        statement={statementOf(approving)}
        onCancel={() => setApproving(null)}
        onConfirm={() => {
          if (approving) {
            send({ id: approving, verdict: 'approve' });
          }

          setApproving(null);
        }}
      />
      <RejectDialog
        statement={statementOf(rejecting)}
        onCancel={() => setRejecting(null)}
        onConfirm={(reason) => {
          if (rejecting) {
            send({ id: rejecting, verdict: 'reject', reason });
          }

          setRejecting(null);
        }}
      />
    </section>
  );
}
