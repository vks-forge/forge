/**
 * `useProjectEvents()`: keeps the open project's screens fresh from its change stream.
 *
 * Why: the user watches the Director plan and Workers build; a card that moves column or a
 *   Director message that arrives should show up at once, on whichever screen is open. The
 *   server names the query keys that changed (`["cards","<slug>"]`, `["card","<id>"]`,
 *   `["tickets","<slug>"]`, `["inbox","<slug>"]`: the same keys the hooks use), and this hook
 *   invalidates exactly those, so each screen refetches itself. It is mounted once, by the
 *   project scope, and publishes whether the stream is open so polling can slow down. After a
 *   dropped stream nothing is replayed, so everything of the project is refetched.
 *
 * Exports: useProjectEvents().
 * Depends on: react, @tanstack/react-query, api/api-provider, state/live-connection.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForgeApi } from '#/api/api-provider.js';
import { setLiveConnected } from '#/state/live-connection.js';

/** Pass `null` while there is no valid project to follow. */
export function useProjectEvents(slug: string | null): void {
  const api = useForgeApi();
  const client = useQueryClient();

  useEffect(() => {
    if (slug === null) {
      return;
    }

    const watch = api.projectEvents.watch({
      slug,
      onInvalidate: (keys) => {
        for (const queryKey of keys) {
          void client.invalidateQueries({ queryKey: [...queryKey] });
        }
      },
      onResync: () => {
        for (const queryKey of [
          ['cards', slug],
          ['card'],
          ['tickets', slug],
          ['inbox', slug],
        ]) {
          void client.invalidateQueries({ queryKey });
        }
      },
      // Polling carries on at its normal pace, so a failed stream needs no message here.
      onError: (error) => {
        // A bad frame leaves the stream open; any other error means it is gone.
        if (error.kind !== 'payload') {
          setLiveConnected(false);
        }
      },
      onConnection: (state) => setLiveConnected(state === 'open'),
    });

    return () => {
      watch.close();
      setLiveConnected(false);
    };
  }, [api, client, slug]);
}
