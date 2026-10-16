/**
 * `useRefetchMs()`: how often a screen polls, given whether the live stream is open.
 *
 * Why: polling every few seconds is what kept the Board current before the project stream
 *   existed. With the stream open the server says what changed, so polling only has to catch a
 *   missed notice; a long interval does that without hammering the server. When the stream is
 *   down the screen's own short interval applies again, so nothing goes stale silently.
 *
 * Exports: useRefetchMs(), LIVE_POLL_MS.
 * Depends on: state/live-connection.
 */

import { useLiveConnected } from '#/state/live-connection.js';

/** Safety-net poll while the stream is open. */
export const LIVE_POLL_MS = 30_000;

/** `base` while the stream is down, `LIVE_POLL_MS` while it is open (never faster than `base`). */
export function useRefetchMs(base: number): number {
  return useLiveConnected() ? Math.max(base, LIVE_POLL_MS) : base;
}
