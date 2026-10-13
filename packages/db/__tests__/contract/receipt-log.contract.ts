/**
 * ReceiptLog contract: one suite every receipt-log backend must pass.
 *
 * Why: gates and the Ticket screen trust a run's tool receipts only if the stored chain
 *   still verifies. The properties that keep it verifiable under a live Worker are pinned
 *   here for every backend: twenty-five simultaneous hook posts yield one gap-free chain
 *   (seq 1..N, each linked to the previous hash), a `build` that throws leaves no
 *   half-written receipt and does not wedge the run, a batch with one bad receipt stores
 *   none of it (so does an effect with no decision), chains of different runs never mix, and the stored rows read back
 *   byte-for-byte as the HMAC'd receipts that were built (verification-plane.md §2,
 *   tool-system.md §10).
 *
 * Exports: describeReceiptLogContract().
 * Depends on: vitest, @forge/tools, helpers/receipts. IO only through the log under test.
 */

import { verifyChain } from '@forge/tools';
import type { DecisionReceipt, EffectReceipt, ReceiptLog } from '@forge/tools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RECEIPT_SECRET, appendDecision, appendEffect } from '#tests/helpers/receipts.js';

/** What the contract needs from a backend: the log and a way to release it. */
export interface ReceiptLogHandle {
  readonly log: ReceiptLog;
  close(): Promise<void>;
}

/** Register the shared contract; `makeLog` must return a fresh, empty log each call. */
export function describeReceiptLogContract(
  name: string,
  makeLog: () => Promise<ReceiptLogHandle> | ReceiptLogHandle,
): void {
  describe(`ReceiptLog contract: ${name}`, () => {
    let handle: ReceiptLogHandle;
    let log: ReceiptLog;
    beforeEach(async () => {
      handle = await makeLog();
      log = handle.log;
    });

    afterEach(async () => {
      await handle.close();
    });

    it('starts empty: no receipts, no tail, lastSeq 0', async () => {
      let seen: { last: unknown; lastSeq: number } | undefined;
      await log.append('r1', (view) => {
        seen = { last: view.last, lastSeq: view.lastSeq };

        return [];
      });

      expect(await log.list('r1')).toEqual([]);
      expect(seen).toEqual({ last: null, lastSeq: 0 });
    });

    it('returns what it stored and lists decisions and effects in chain order', async () => {
      const [d1] = await appendDecision(log, 'r1', 'c1');
      const [d2] = await appendDecision(log, 'r1', 'c2');
      const [e1] = await appendEffect(log, 'r1', 'c1');
      const [e2] = await appendEffect(log, 'r1', 'c2');
      const listed = await log.list('r1');
      expect(listed).toEqual([d1, d2, e1, e2]);
      expect(listed.map((r) => r.kind)).toEqual([
        'decision',
        'decision',
        'effect',
        'effect',
      ]);

      expect(verifyChain(listed, RECEIPT_SECRET)).toEqual({ ok: true, value: 4 });
    });

    it('round-trips every receipt field exactly (a lossy column would break the MAC)', async () => {
      const [d] = await appendDecision(log, 'r1', 'c1', {
        decision: 'deny',
        reason: 'managed_deny',
        enforced_by: 'forge_admit',
        enforcement: null,
        layer: 'floor',
        matched_rule: null,
        finding_ids: [],
        tool: 'read',
      });

      const [e] = await appendEffect(log, 'r1', 'c1');
      expect(await log.list('r1')).toEqual([d, e]);
    });

    it('lets build see the open decision, and not once an effect closes it', async () => {
      await appendDecision(log, 'r1', 'c1');
      await appendDecision(log, 'r1', 'c2');
      const seen: Record<string, string | null> = {};
      await log.append('r1', (view) => {
        seen['byId'] = view.openDecision('c1')?.id ?? null;
        seen['missing'] = view.openDecision('nope')?.id ?? null;
        seen['latest'] = view.latestOpenDecision('shell')?.id ?? null;
        seen['other'] = view.latestOpenDecision('read')?.id ?? null;

        return [];
      });

      await appendEffect(log, 'r1', 'c2');
      await log.append('r1', (view) => {
        seen['latestAfter'] = view.latestOpenDecision('shell')?.id ?? null;
        seen['closed'] = view.openDecision('c2')?.id ?? null;
        seen['lastKind'] = view.last?.kind ?? null;

        return [];
      });

      expect(seen).toEqual({
        byId: 'c1',
        missing: null,
        latest: 'c2',
        other: null,
        latestAfter: 'c1',
        closed: null,
        lastKind: 'effect',
      });
    });

    it('serialises 25 simultaneous appends into one gap-free, verifiable chain', async () => {
      const N = 25;
      await Promise.all(
        Array.from({ length: N }, (_, i) => appendDecision(log, 'r1', `c${i}`)),
      );

      const chain = await log.list('r1');
      const seqs = chain.map((r) => (r as DecisionReceipt).seq);
      expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));
      expect(verifyChain(chain, RECEIPT_SECRET)).toEqual({ ok: true, value: N });
    });

    it('keeps a mixed burst of decisions and effects verifiable', async () => {
      await Promise.all(
        Array.from({ length: 10 }, async (_, i) => {
          await appendDecision(log, 'r1', `c${i}`);
          await appendEffect(log, 'r1', `c${i}`);
        }),
      );

      const chain = await log.list('r1');
      expect(chain).toHaveLength(20);
      expect(verifyChain(chain, RECEIPT_SECRET).ok).toBe(true);
    });

    it('discards a throwing build, writes nothing and keeps serving the run', async () => {
      await appendDecision(log, 'r1', 'c1');
      await expect(
        log.append('r1', () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await log.list('r1')).toHaveLength(1);
      await appendDecision(log, 'r1', 'c2');
      const chain = await log.list('r1');
      expect(chain.map((r) => (r as DecisionReceipt).seq)).toEqual([1, 2]);
      expect(verifyChain(chain, RECEIPT_SECRET).ok).toBe(true);
    });

    it('stores nothing when build returns no receipts', async () => {
      await expect(log.append('r1', () => [])).resolves.toEqual([]);
      expect(await log.list('r1')).toEqual([]);
    });

    it('stores none of a batch when one receipt in it is rejected', async () => {
      const [d] = await appendDecision(log, 'r1', 'c1');
      await expect(
        log.append('r1', (view) => {
          const next = view.last as DecisionReceipt;

          // A second decision reusing id c1 cannot be stored; the whole batch must fail.
          return [
            { ...next, seq: 2, id: 'c2' },
            { ...next, seq: 3 },
          ];
        }),
      ).rejects.toThrow();

      expect(await log.list('r1')).toEqual([d]);
    });

    it('refuses a receipt that belongs to another run', async () => {
      const [foreign] = await appendDecision(log, 'r-other', 'x1');
      await expect(
        log.append('r1', () => [foreign as DecisionReceipt]),
      ).rejects.toThrow();

      expect(await log.list('r1')).toEqual([]);
    });

    it('refuses an effect with no decision, and a second effect for one decision', async () => {
      const [d] = await appendDecision(log, 'r1', 'c1');
      const [e] = await appendEffect(log, 'r1', 'c1');
      await expect(
        log.append('r1', () => [{ ...(e as EffectReceipt), decision_id: 'ghost' }]),
      ).rejects.toThrow();

      await expect(log.append('r1', () => [e as EffectReceipt])).rejects.toThrow();
      expect(await log.list('r1')).toEqual([d, e]);
    });

    it('refuses a second decision with the same id', async () => {
      await appendDecision(log, 'r1', 'c1');
      await expect(appendDecision(log, 'r1', 'c1')).rejects.toThrow();
      expect(await log.list('r1')).toHaveLength(1);
    });

    it('keeps chains of different runs apart', async () => {
      await Promise.all([
        appendDecision(log, 'r1', 'a1'),
        appendDecision(log, 'r2', 'b1'),
        appendDecision(log, 'r1', 'a2'),
        appendDecision(log, 'r2', 'b2'),
      ]);

      const r1 = await log.list('r1');
      const r2 = await log.list('r2');
      expect(r1.map((r) => (r as DecisionReceipt).id)).toEqual(['a1', 'a2']);
      expect(r2.map((r) => (r as DecisionReceipt).id)).toEqual(['b1', 'b2']);
      expect(verifyChain(r1, RECEIPT_SECRET).ok).toBe(true);
      expect(verifyChain(r2, RECEIPT_SECRET).ok).toBe(true);
      expect(await log.list('r3')).toEqual([]);
    });
  });
}
