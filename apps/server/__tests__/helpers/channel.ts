/**
 * A tiny async queue: one producer pushes, one consumer iterates until closed.
 *
 * Why: a fake Worker driver must hand the engine's run pump a live event stream that keeps
 *   producing while the script runs and ends when the script ends. An async iterable over
 *   a queue is the smallest honest model of that, and it keeps the fake free of timers.
 *
 * Exports: Channel, createChannel().
 * Depends on: none. No IO.
 */

export interface Channel<T> {
  push(item: T): void;
  close(): void;
  iterate(): AsyncIterable<T>;
}

export function createChannel<T>(): Channel<T> {
  const items: T[] = [];
  let closed = false;
  let wake: (() => void) | null = null;

  const notify = (): void => {
    wake?.();
    wake = null;
  };

  return {
    push(item) {
      items.push(item);
      notify();
    },
    close() {
      closed = true;
      notify();
    },
    async *iterate() {
      for (;;) {
        const next = items.shift();
        if (next !== undefined) {
          yield next;
        } else if (closed) {
          return;
        } else {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      }
    },
  };
}
