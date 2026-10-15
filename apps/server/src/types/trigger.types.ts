/**
 * Types of the trigger registry and the polling loop.
 *
 * Why: the intake route and the poller both need "the ticket sources this server accepts"
 *   and must agree on its shape; a named contract keeps them from reaching into each other.
 *
 * Exports: TriggerRegistry, TriggerPoller, TriggerPollerDeps.
 * Depends on: @forge/core (TriggerAdapter, IntakeEvent), @forge/engine (Logger). Types only.
 */

import type { IntakeEvent, TriggerAdapter } from '@forge/core';
import type { Logger } from '@forge/engine';

/** The ticket sources this server accepts events from; anything else is refused. */
export interface TriggerRegistry {
  /** Adds an adapter; throws when its id or source is already taken or its capabilities lie. */
  register(adapter: TriggerAdapter): void;
  /** The adapter that owns `source`, or undefined (fail closed: the caller refuses). */
  forSource(source: string): TriggerAdapter | undefined;
  list(): readonly TriggerAdapter[];
  /** The adapters the poller must call: the ones that declare `poll`. */
  polled(): readonly TriggerAdapter[];
}

export interface TriggerPollerDeps {
  readonly registry: TriggerRegistry;
  /** Hands one validated event to the engine. */
  readonly ingest: (event: IntakeEvent) => Promise<unknown>;
  readonly intervalMs: number;
  readonly log: Logger;
}

/** Calls `poll` on every polled adapter on an interval, with an in-memory cursor each. */
export interface TriggerPoller {
  /** Starts the interval; does nothing when no polled adapter is registered. */
  start(): void;
  /** One pass over every polled adapter; resolves when done, never throws. */
  pollOnce(): Promise<void>;
  /** Stops the interval and waits for a pass in flight. */
  stop(): Promise<void>;
}
