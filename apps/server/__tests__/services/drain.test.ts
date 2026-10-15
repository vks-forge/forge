/**
 * Shutdown drain: the switch and the wait for in-flight tool calls.
 *
 * Why: a graceful stop interrupts runs only after the tool calls they had already started
 *   recorded their effect receipt, so the resumed Worker's claim for an edit made just before
 *   the stop is backed by a signed receipt (d-0092). The wait must end as soon as every run is
 *   quiet, must end at the timeout when a call never completes (fail closed stays as it is),
 *   and must name the runs it gave up on.
 *
 * Pins: not draining until begin(); returns at once for quiet runs; waits while a call is
 *   open and returns when its effect arrives; at the timeout returns the runs still open; a
 *   read error counts as quiet rather than blocking shutdown.
 * Depends on: src/services/drain. No IO.
 */

import type { Receipt, ReceiptLog } from '@forge/tools';
import { describe, expect, it } from 'vitest';
import { createDrain } from '#/services/drain.js';

const decision = (id: string): Receipt =>
  ({ kind: 'decision', id, decision: 'allow' }) as unknown as Receipt;

const effect = (id: string): Receipt =>
  ({ kind: 'effect', decision_id: id }) as unknown as Receipt;

/** A receipt log whose chains the test edits; time only moves when the drain sleeps. */
function rig(chains: Record<string, Receipt[]>, onSleep: () => void = () => undefined) {
  let clock = 0;
  const receipts = {
    list: async (id: string) => chains[id] ?? [],
    append: async () => [],
  } as unknown as ReceiptLog;

  const drain = createDrain({
    receipts,
    pollMs: 10,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
      onSleep();
    },
  });

  return { drain, clock: () => clock };
}

describe('createDrain', () => {
  it('is not draining until begin()', () => {
    const { drain } = rig({});

    expect(drain.isDraining()).toBe(false);
    drain.begin();
    expect(drain.isDraining()).toBe(true);
  });

  it('returns at once when no run has a call in flight', async () => {
    const { drain, clock } = rig({ a: [decision('u1'), effect('u1')], b: [] });

    expect(await drain.awaitQuiet(['a', 'b'], 1_000)).toEqual([]);
    expect(clock()).toBe(0);
  });

  it('waits while a call is open and returns when its effect arrives', async () => {
    const chains: Record<string, Receipt[]> = { a: [decision('u1')] };
    let sleeps = 0;
    const { drain, clock } = rig(chains, () => {
      if (++sleeps === 3) {
        chains['a']?.push(effect('u1'));
      }
    });

    expect(await drain.awaitQuiet(['a'], 1_000)).toEqual([]);
    expect(clock()).toBe(30);
  });

  it('gives up at the timeout and names the runs still in flight', async () => {
    const { drain, clock } = rig({ a: [decision('u1')], b: [] });

    expect(await drain.awaitQuiet(['a', 'b'], 100)).toEqual(['a']);
    expect(clock()).toBeGreaterThanOrEqual(100);
  });

  it('does not wait at all for a zero timeout', async () => {
    const { drain, clock } = rig({ a: [decision('u1')] });

    expect(await drain.awaitQuiet(['a'], 0)).toEqual(['a']);
    expect(clock()).toBe(0);
  });

  it('treats an unreadable chain as quiet', async () => {
    const receipts = {
      list: async () => {
        throw new Error('db closed');
      },
    } as unknown as ReceiptLog;

    const drain = createDrain({ receipts, sleep: async () => undefined });

    expect(await drain.awaitQuiet(['a'], 100)).toEqual([]);
  });
});
