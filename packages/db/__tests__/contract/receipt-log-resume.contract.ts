/**
 * ReceiptLog contract, resumed receipts: the join between two run secret generations.
 *
 * Why: a run resumed after a server restart signs under a new secret (d-0100), and gate G1
 *   verifies each generation's segment with that generation's secret. For that every backend
 *   must store the `resumed` receipt in chain order, link it to the tail, advance the chain's
 *   generation (`ChainView.generation`), refuse a resume that does not start the next generation
 *   or belongs to another run, and keep a decision that was open before the restart closable
 *   after it. If a backend dropped the link or let a generation repeat, a resumed chain would
 *   either fail verification or verify with the wrong key.
 *
 * Exports: describeResumedReceipts().
 * Depends on: vitest, @forge/tools, helpers/receipts. IO only through the log under test.
 */

import { verifyGenerations } from '@forge/tools';
import type { DecisionReceipt, ReceiptLog } from '@forge/tools';
import { describe, expect, it } from 'vitest';
import {
  RECEIPT_SECRET,
  RESUME_SECRET,
  appendDecision,
  appendEffect,
  appendResumed,
} from '#tests/helpers/receipts.js';

/** Registers the cases inside the surrounding suite; `getLog` returns the fresh log of the current test. */
export function describeResumedReceipts(getLog: () => ReceiptLog): void {
  describe('resumed receipts (d-0100)', () => {
    const secretFor = (g: number): string | null =>
      g === 1 ? RECEIPT_SECRET : g === 2 ? RESUME_SECRET : null;

    it('a fresh chain is generation 1; a resumed receipt makes it generation 2', async () => {
      const seen: number[] = [];
      const peek = (): Promise<readonly unknown[]> =>
        getLog().append('r1', (view) => {
          seen.push(view.generation);

          return [];
        });

      await peek();
      await appendDecision(getLog(), 'r1', 'c1');
      await appendResumed(getLog(), 'r1');
      await peek();

      expect(seen).toEqual([1, 2]);
    });

    it('stores the link in chain order and the chain verifies per generation', async () => {
      const [d1] = await appendDecision(getLog(), 'r1', 'c1');
      const [e1] = await appendEffect(getLog(), 'r1', 'c1');
      const [resumed] = await appendResumed(getLog(), 'r1');
      const [d2] = await appendDecision(getLog(), 'r1', 'c2', undefined, RESUME_SECRET);

      const stored = await getLog().list('r1');
      expect(stored).toEqual([d1, e1, resumed, d2]);
      expect(resumed).toMatchObject({ kind: 'resumed', generation: 2 });
      expect(resumed?.prev_hash).toBe(e1?.hash);
      expect(verifyGenerations(stored, secretFor)).toEqual({
        ok: true,
        value: { receipts: 4, generations: 2 },
      });
    });

    it('keeps decision seq counting across the resume', async () => {
      await appendDecision(getLog(), 'r1', 'c1');
      await appendResumed(getLog(), 'r1');
      const [d2] = await appendDecision(getLog(), 'r1', 'c2', undefined, RESUME_SECRET);

      expect((d2 as DecisionReceipt).seq).toBe(2);
    });

    it('allows a resume on a chain with no receipts yet', async () => {
      const [resumed] = await appendResumed(getLog(), 'r1');

      expect(resumed?.prev_hash).toBeNull();
      expect(verifyGenerations(await getLog().list('r1'), secretFor).ok).toBe(true);
    });

    it('refuses a resume that does not start the next generation, or belongs to another run', async () => {
      await appendResumed(getLog(), 'r1');
      const [again] = await appendResumed(getLog(), 'r2');

      await expect(getLog().append('r1', () => [again as never])).rejects.toThrow();
      await expect(
        getLog().append('r1', (view) => [
          { ...(view.last as object), generation: 4 } as never,
        ]),
      ).rejects.toThrow();

      expect(await getLog().list('r1')).toHaveLength(1);
    });

    it('lets the same decision id close in the next generation (open decisions survive a resume)', async () => {
      await appendDecision(getLog(), 'r1', 'c1');
      await appendResumed(getLog(), 'r1');
      const [e] = await appendEffect(getLog(), 'r1', 'c1', RESUME_SECRET);

      expect(e?.kind).toBe('effect');
    });
  });
}
