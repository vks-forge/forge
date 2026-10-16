/**
 * Project events: the in-process hub between writes and open project streams.
 *
 * Why: the control room keeps one live stream per project (`GET /projects/:slug/events`) that
 *   only says which queries went stale (d-0132). The writers (the engine, the routes) call
 *   `invalidate`, the stream routes `subscribe`; neither knows about the other. Naming the
 *   hub as an interface lets tests watch it without a socket and keeps the stream route free
 *   of any knowledge of what was written.
 *
 * Exports: ProjectEventListener, ProjectEvents.
 * Depends on: @forge/core (ProjectEventSink, QueryKey). Types only.
 */

import type { ProjectEventSink, QueryKey } from '@forge/core';

/** Receives the query keys of one invalidation. */
export type ProjectEventListener = (keys: readonly QueryKey[]) => void;

export interface ProjectEvents extends ProjectEventSink {
  /** Calls `listener` for each invalidation of `slug` from now on (nothing is replayed); returns the unsubscribe. */
  subscribe(slug: string, listener: ProjectEventListener): () => void;
}
