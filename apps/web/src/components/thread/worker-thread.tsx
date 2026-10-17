/**
 * WorkerThread: the live conversation of a run, with follow-the-newest scrolling.
 *
 * Why: this is the screen's centre: the user watches a Worker think and act. It must say
 *   whether it is live (connecting, live, reconnecting, over, lost, with a retry), follow the
 *   newest line only while the user is at the bottom, offer "Jump to latest" with a count
 *   of what they missed once they scroll up, and stay smooth when a run has thousands of
 *   lines (virtualised past 100 items, rows measured as they render). New lines announce
 *   politely to screen readers through a log region.
 *
 * Exports: WorkerThread.
 * Depends on: react, lucide-react, @tanstack/react-virtual, components/thread/*,
 *   components/ui/button, state/thread-prefs, types/thread.types.
 */

import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown } from 'lucide-react';
import { useRef } from 'react';
import { ThreadItemView } from '#/components/thread/thread-item-view.js';
import { useStickToBottom } from '#/components/thread/use-stick-to-bottom.js';
import { Button } from '#/components/ui/button.js';
import { useThreadPrefs } from '#/state/thread-prefs.js';
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

export function WorkerThread(props: {
  items: readonly ThreadItem[];
  connection: ThreadConnection;
  endStatus: string | null;
  notice: string | null;
  pending: ReadonlySet<string>;
  onRetry: () => void;
}) {
  const { items, connection } = props;
  const { followLatest, setFollowLatest, expandTools, setExpandTools } = useThreadPrefs();
  const scroller = useRef<HTMLDivElement>(null);
  const windowed = items.length > THREAD_WINDOW;
  const virtualizer = useVirtualizer({
    count: windowed ? items.length : 0,
    getScrollElement: () => scroller.current,
    estimateSize: () => 56,
    overscan: 10,
    getItemKey: (index) => items[index]?.seq ?? index,
  });

  const { stuck, unread, onScroll, jumpToLatest } = useStickToBottom(
    scroller,
    items.length,
    windowed ? virtualizer.getTotalSize() : 0,
    followLatest,
  );

  const live = connection === 'live';

  return (
    <section
      aria-label="Worker thread"
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2"
    >
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
      </div>

      {props.notice ? (
        <p role="alert" className="rounded-lg bg-danger-soft p-2 text-sm">
          {props.notice}
        </p>
      ) : null}

      <div className="relative min-w-0">
        <div
          ref={scroller}
          onScroll={onScroll}
          role="log"
          aria-live="polite"
          aria-label="Worker messages"
          tabIndex={0}
          className="h-[60dvh] overflow-y-auto rounded-xl border border-line bg-bg p-3"
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
                    className="absolute inset-x-0 top-0 min-w-0 pb-3"
                    style={{ transform: `translateY(${row.start}px)` }}
                  >
                    <ThreadItemView
                      item={item}
                      expandTools={expandTools}
                      pending={props.pending}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <ol className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
              {items.map((item) => (
                <li key={item.seq} className="min-w-0">
                  <ThreadItemView
                    item={item}
                    expandTools={expandTools}
                    pending={props.pending}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
        {!stuck ? (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 inline-flex min-h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-signal px-3 text-sm font-medium text-on-signal shadow-float hover:bg-signal-hi"
          >
            <ArrowDown aria-hidden="true" className="size-4" />
            Jump to latest
            {unread > 0 ? (
              <span className="font-data text-xs">({unread} new)</span>
            ) : null}
          </button>
        ) : null}
      </div>
    </section>
  );
}
