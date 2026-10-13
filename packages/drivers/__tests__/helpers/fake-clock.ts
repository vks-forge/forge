/**
 * Manual clock for driver tests.
 *
 * Why: the driver's stall timer, receipt grace window, auth wait and cancel grace are all
 *   time windows. Testing them with real timers would make the suite slow and flaky; a
 *   clock the test advances by hand fires exactly the timers that are due, in order, and
 *   lets pending promise work settle between them, so "no event for stallMs" is one line.
 *
 * Exports: FakeClock, createFakeClock().
 * Depends on: nothing. No IO.
 */

export interface FakeClock {
  now(): number;
  after(ms: number, fn: () => void): () => void;
  /** Moves time forward, firing due timers in order and letting promises settle between them. */
  advance(ms: number): Promise<void>;
  /** Number of timers still waiting. */
  pending(): number;
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export function createFakeClock(start = Date.UTC(2026, 9, 13, 12, 0, 0)): FakeClock {
  let current = start;
  let nextId = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();

  return {
    now: () => current,
    after(ms, fn) {
      const id = nextId++;
      timers.set(id, { at: current + ms, fn });

      return () => {
        timers.delete(id);
      };
    },
    pending: () => timers.size,
    async advance(ms) {
      const target = current + ms;
      for (;;) {
        await settle();
        let due: [number, { at: number; fn: () => void }] | undefined;
        for (const entry of timers) {
          if (entry[1].at <= target && (!due || entry[1].at < due[1].at)) {
            due = entry;
          }
        }

        if (!due) {
          break;
        }

        timers.delete(due[0]);
        current = Math.max(current, due[1].at);
        due[1].fn();
      }

      current = target;
      await settle();
    },
  };
}
