/**
 * Live connection: whether the project's change stream is open right now.
 *
 * Why: while the stream is open the server tells the page what changed, so the screens can
 *   poll slowly as a safety net; the moment it drops they must go back to polling fast, or the
 *   Board would go stale without a word. The project scope publishes the stream's state here
 *   once and every polling hook reads it, so no screen needs to know a stream exists.
 *
 * Exports: useLiveConnected(), setLiveConnected().
 * Depends on: state/create-transient-store.
 */

import { createTransientStore } from '#/state/create-transient-store.js';

const useLiveStore = createTransientStore({ connected: false });

export const useLiveConnected = (): boolean => useLiveStore((s) => s.connected);

export function setLiveConnected(connected: boolean): void {
  useLiveStore.setState({ connected });
}
