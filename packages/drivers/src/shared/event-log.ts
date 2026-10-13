/**
 * Append-only log with replayable async iteration.
 *
 * Why: a run's events are produced by the harness reader and consumed by whoever calls
 *   `events(handle)`, possibly late and possibly twice (the control room attaches after the
 *   run started; storage drains from the beginning). A plain stream would lose what was
 *   emitted before the consumer arrived; this log keeps every item and lets each iterator
 *   start from the first one and wait for more until the log is closed.
 *
 * Exports: EventLog.
 * Depends on: nothing. No IO.
 */

export class EventLog<T> {
  private readonly items: T[] = [];
  private waiters: (() => void)[] = [];
  private isClosed = false;

  /** Appends an item and wakes waiting iterators; ignored once closed. */
  push(item: T): void {
    if (this.isClosed) return;
    this.items.push(item);
    this.wake();
  }

  /** No more items will arrive; iterators finish after draining. */
  close(): void {
    this.isClosed = true;
    this.wake();
  }

  /** Snapshot of everything appended so far. */
  snapshot(): readonly T[] {
    return [...this.items];
  }

  /** Yields every item from the start, then waits for new ones until closed. */
  async *iterate(): AsyncGenerator<T> {
    let next = 0;
    for (;;) {
      while (next < this.items.length) yield this.items[next++] as T;
      if (this.isClosed) return;
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }

  private wake(): void {
    const waiting = this.waiters;
    this.waiters = [];
    for (const resolve of waiting) resolve();
  }
}
