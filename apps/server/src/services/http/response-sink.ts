/**
 * An SSE sink over a Node response, with backpressure and no leaked listeners.
 *
 * Why: a long-lived stream writes thousands of frames over its life. When the socket's
 *   buffer is full the writer must wait for `drain`, or for `close` if the client left
 *   first. Waiting with two bare `once` listeners leaves the loser attached to the response
 *   every time, so a slow client slowly accumulates listeners on one object until Node
 *   warns about a leak; an `AbortSignal` removes whichever listener did not fire.
 *
 * Exports: responseSink().
 * Depends on: node:events, node:http, types/http. IO: writes the response.
 */

import { once } from 'node:events';
import type { ServerResponse } from 'node:http';
import type { SseSink } from '#/types/http.types.js';

/** A sink over a response; a closed connection makes writes no-ops. */
export function responseSink(res: ServerResponse): SseSink {
  return {
    async write(chunk) {
      if (res.destroyed || res.writableEnded) {
        return;
      }

      if (res.write(chunk)) {
        return;
      }

      const settled = new AbortController();
      try {
        await Promise.race([
          once(res, 'drain', { signal: settled.signal }),
          once(res, 'close', { signal: settled.signal }),
        ]);
      } finally {
        // Detaches the listener that did not fire; its AbortError rejection is already
        // handled by the race.
        settled.abort();
      }
    },
  };
}
