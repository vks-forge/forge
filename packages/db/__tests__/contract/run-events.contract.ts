/**
 * Contract cases for the per-run event log.
 *
 * Why: the driver and the MCP server both append events to the same run. If either chose
 * the sequence number, two writers could collide or leave a gap and replay would no longer
 * reproduce the run. Storage alone numbers events; these cases pin that on every backend,
 * along with payload round-trips and typed failures (director-core.md §7).
 *
 * Exports: describeRunEventsContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from '@forge/core';
import { makeTextEvent } from '#tests/helpers/fixtures.js';

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeRunEventsContract(getDb: () => StorageAdapter): void {
  const db: Pick<StorageAdapter, 'transaction'> = {
    transaction: (fn) => getDb().transaction(fn),
  };

  describe('run events', () => {
    it('round-trips a tool_call / tool_result whose unknown payload is undefined', async () => {
      const call = {
        type: 'tool_call' as const,
        ts: '2026-10-13T00:00:00.000Z',
        call_id: 'c1',
        name: 'noop',
        input: undefined,
      };

      const result = {
        type: 'tool_result' as const,
        ts: '2026-10-13T00:00:01.000Z',
        call_id: 'c1',
        output: undefined,
        is_error: false,
      };

      const stored = await db.transaction(async (tx) => [
        await tx.runEvents.append('r1', call),
        await tx.runEvents.append('r1', result),
      ]);

      const listed = await db.transaction((tx) => tx.runEvents.listByRun('r1'));
      expect(listed).toStrictEqual(stored);
      expect(listed[0]).toMatchObject({ input: null });
      expect(listed[1]).toMatchObject({ output: null });
    });

    it('allocates seq from 0, contiguous per run, and returns the stored event', async () => {
      const out = await db.transaction(async (tx) => ({
        a0: await tx.runEvents.append('r1', makeTextEvent('a')),
        a1: await tx.runEvents.append('r1', makeTextEvent('b')),
        b0: await tx.runEvents.append('r2', makeTextEvent('other')),
      }));

      const all = await db.transaction((tx) => tx.runEvents.listByRun('r1'));
      expect(out.a0).toMatchObject({ seq: 0, text: 'a' });
      expect(out.a1.seq).toBe(1);
      expect(out.b0.seq).toBe(0);
      expect(all).toEqual([out.a0, out.a1]);
    });

    it('continues after the highest stored seq across transactions', async () => {
      await db.transaction((tx) => tx.runEvents.append('r1', makeTextEvent()));
      const next = await db.transaction((tx) =>
        tx.runEvents.append('r1', makeTextEvent()),
      );

      expect(next.seq).toBe(1);
    });

    it('gives two concurrent writers distinct, gap-free seqs', async () => {
      const writer = (tag: string) =>
        Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            db.transaction((tx) =>
              tx.runEvents.append('r1', makeTextEvent(`${tag}${i}`)),
            ),
          ),
        );

      await Promise.all([writer('driver-'), writer('mcp-')]);
      const all = await db.transaction((tx) => tx.runEvents.listByRun('r1'));
      expect(all.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(new Set(all.map((e) => (e as { text: string }).text)).size).toBe(10);
    });

    it('ignores a seq smuggled in by the caller; storage owns numbering', async () => {
      const smuggled = { ...makeTextEvent('x'), seq: 99 } as never;
      const stored = await db.transaction((tx) => tx.runEvents.append('r1', smuggled));
      expect(stored.seq).toBe(0);
    });

    it('returns only events after afterSeq', async () => {
      await db.transaction(async (tx) => {
        for (let i = 0; i < 4; i++) {
          await tx.runEvents.append('r1', makeTextEvent());
        }
      });

      const tail = await db.transaction((tx) => tx.runEvents.listByRun('r1', 1));
      expect(tail.map((e) => e.seq)).toEqual([2, 3]);
    });

    it('rejects an invalid event without consuming a seq', async () => {
      const bad = { type: 'text', ts: 'not-a-date', text: 'x' } as never;
      await expect(
        db.transaction((tx) => tx.runEvents.append('r1', bad)),
      ).rejects.toThrow();

      const ok = await db.transaction((tx) => tx.runEvents.append('r1', makeTextEvent()));

      expect(ok.seq).toBe(0);
    });

    it('preserves structured payloads', async () => {
      const ev = {
        type: 'tool_call' as const,
        ts: '2026-10-13T00:00:00.000Z',
        call_id: 'c1',
        name: 'bash',
        input: { cmd: 'ls', nested: [1, { a: null }] },
      };

      await db.transaction((tx) => tx.runEvents.append('r1', ev));
      const [got] = await db.transaction((tx) => tx.runEvents.listByRun('r1'));
      expect(got).toEqual({ ...ev, seq: 0 });
    });
  });
}
