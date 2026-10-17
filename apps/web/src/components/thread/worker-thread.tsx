/**
 * WorkerThread: the live conversation of a run, with follow-the-newest scrolling.
 *
 * Why: this is the screen's centre: the user watches a Worker think and act. It must say
 *   whether it is live (connecting, live, reconnecting, over, lost, with a retry), follow the
 *   newest line only while the user is at the bottom, offer "Jump to latest" with a count
 *   of what they missed once they scroll up, and stay smooth when a run has thousands
 *   of lines (virtualised past 100 items, rows measured as they render). It is a chat pane:
 *   the list scrolls above a docked box (the steer box, when the run can take messages), so
 *   the box never moves. Consecutive Worker messages are grouped under one header and time,
 *   and a new day gets a separator. New lines announce politely to screen readers through a
 *   log region.
 *
 * Exports: WorkerThread.
 * Depends on: react, @tanstack/react-virtual, components/chat/chat-pane, components/thread/*,
 *   components/ui/button, domain/chat-groups, state/thread-prefs, state/use-now, types/*.
 */

import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { ChatPane } from '#/components/chat/chat-pane.js';
import { ThreadItemView } from '#/components/thread/thread-item-view.js';
import { Button } from '#/components/ui/button.js';
import { groupChat } from '#/domain/chat-groups.js';
import { useThreadPrefs } from '#/state/thread-prefs.js';
import { useNow } from '#/state/use-now.js';
import type { ScrollMemory } from '#/types/route-tabs.types.js';
import type { ThreadConnection, ThreadItem } from '#/types/thread.types.js';

/** More items than this and the thread is virtualised. */
export const THREAD_WINDOW = 100;

const CONNECTION_LABEL: Readonly<Record<ThreadConnection, string>> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Connection lost, reconnecting…',
  ended: 'Run ended',
  failed: 'Disconnected',
};

/** Who a thread item speaks for, so consecutive messages group; null for events. */
function authorOf(item: ThreadItem): string | null {
  if (item.kind === 'message') {
    return 'worker';
  }

  return item.kind === 'user' ? `user:${item.author}` : null;
}

export function WorkerThread(props: {
  items: readonly ThreadItem[];
  connection: ThreadConnection;
  endStatus: string | null;
  notice: string | null;
  pending: ReadonlySet<string>;
  onRetry: () => void;
  /** The docked box under the list (the steer box); absent when the run takes no messages. */
  composer?: ReactNode;
  memory?: ScrollMemory;
  memoryKey?: string;
}) {
  const { items, connection } = props;
  const { followLatest, setFollowLatest, expandTools, setExpandTools } = useThreadPrefs();
  const scroller = useRef<HTMLDivElement>(null);
  const now = useNow();
  const windowed = items.length > THREAD_WINDOW;
  const metas = useMemo(
    () =>
      groupChat(
        items.map((item) => ({ at: item.ts, author: authorOf(item) })),
        now,
      ),
    [items, now],
  );

  const virtualizer = useVirtualizer({
    count: windowed ? items.length : 0,
    getScrollElement: () => scroller.current,
    estimateSize: () => 56,
    overscan: 10,
    getItemKey: (index) => items[index]?.seq ?? index,
  });

  const live = connection === 'live';
  const view = (item: ThreadItem, index: number): ReactNode => {
    const meta = metas[index];

    return (
      <ThreadItemView
        item={item}
        expandTools={expandTools}
        pending={props.pending}
        {...(meta === undefined ? {} : { meta })}
        first={index === 0}
      />
    );
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h2 className="text-sm font-semibold">Worker thread</h2>
      <p
        role="status"
        className={`flex items-center gap-1.5 text-xs ${connection === 'failed' ? 'text-danger' : 'text-muted'}`}
      >
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${live ? 'bg-signal' : connection === 'failed' ? 'bg-danger' : 'bg-faint'}`}
        />
        {CONNECTION_LABEL[connection]}
        {connection === 'ended' && props.endStatus ? ` (${props.endStatus})` : ''}
      </p>
      {connection === 'failed' ? (
        <Button onClick={props.onRetry}>Reconnect</Button>
      ) : null}
      <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
        <input
          type="checkbox"
          checked={followLatest}
          onChange={(event) => setFollowLatest(event.target.checked)}
        />
        Follow latest
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted">
        <input
          type="checkbox"
          checked={expandTools}
          onChange={(event) => setExpandTools(event.target.checked)}
        />
        Expand tool calls
      </label>
      {props.notice ? (
        <p role="alert" className="w-full rounded-lg bg-danger-soft p-2 text-sm">
          {props.notice}
        </p>
      ) : null}
    </div>
  );

  return (
    <section aria-label="Worker thread" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ChatPane
        label="Worker messages"
        ref={scroller}
        count={items.length}
        size={windowed ? virtualizer.getTotalSize() : 0}
        follow={followLatest}
        {...(props.memory === undefined ? {} : { memory: props.memory })}
        {...(props.memoryKey === undefined ? {} : { memoryKey: props.memoryKey })}
        toolbar={toolbar}
        composer={props.composer}
      >
        {items.length === 0 ? (
          <p className="text-sm text-muted">
            {connection === 'ended'
              ? 'This run recorded no messages.'
              : 'Waiting for the Worker’s first message…'}
          </p>
        ) : windowed ? (
          <div
            className="relative min-w-0"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const item = items[row.index] as ThreadItem;

              return (
                <div
                  key={row.key}
                  ref={virtualizer.measureElement}
                  data-index={row.index}
                  className="absolute inset-x-0 top-0 min-w-0"
                  style={{ transform: `translateY(${row.start}px)` }}
                >
                  {view(item, row.index)}
                </div>
              );
            })}
          </div>
        ) : (
          <ol className="min-w-0">
            {items.map((item, index) => (
              <li key={item.seq} className="min-w-0">
                {view(item, index)}
              </li>
            ))}
          </ol>
        )}
      </ChatPane>
    </section>
  );
}
