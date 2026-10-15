/**
 * `useRunThread()`: follows one run's events and folds them into thread items.
 *
 * Why: the Ticket page shows a Worker working, live. The hook opens the run's event stream
 *   through the API port (the http adapter's server-sent events), folds each event with `applyEvent` (replays after a reconnect are
 *   ignored), and reports honestly whether the thread is connecting, live, reconnecting,
 *   over or lost, because a quiet run and a dead connection look the same on screen. A frame
 *   the page cannot read is a notice, not the end of the thread. The stream is closed on
 *   unmount or when the run changes, so no connection outlives its screen.
 *
 * Exports: useRunThread().
 * Depends on: react, api/api-provider, domain/thread, types/thread.types.
 */

import { useEffect, useReducer, useState } from 'react';
import type { RunEvent } from '@forge/core';
import { useForgeApi } from '#/api/api-provider.js';
import { EMPTY_THREAD, applyEvent } from '#/domain/thread.js';
import type { ThreadConnection, ThreadState } from '#/types/thread.types.js';

export function useRunThread(runId: string | undefined) {
  const api = useForgeApi();
  const [thread, dispatch] = useReducer(
    (state: ThreadState, event: RunEvent) => applyEvent(state, event),
    EMPTY_THREAD,
  );

  const [connection, setConnection] = useState<ThreadConnection>('connecting');
  const [endStatus, setEndStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (runId === undefined) {
      return undefined;
    }

    const watch = api.runEvents.watch({
      runId,
      onEvent: dispatch,
      onEnd: (status) => {
        setEndStatus(status);
        setConnection('ended');
      },
      onConnection: (state) => setConnection(state === 'open' ? 'live' : state),
      onError: (error) => {
        if (error.kind === 'payload') {
          setNotice('A message from Forge could not be read and was skipped.');

          return;
        }

        setNotice(error.message);
        setConnection('failed');
      },
    });

    return () => watch.close();
  }, [api, runId, attempt]);

  return {
    items: thread.items,
    connection,
    endStatus,
    notice,
    /** Opens a new stream; events already shown are not shown twice. */
    retry: (): void => {
      setNotice(null);
      setConnection('connecting');
      setAttempt((n) => n + 1);
    },
  };
}
