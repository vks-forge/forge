/**
 * In-memory ReceiptLog: per-run chains with serialised, atomic appends.
 *
 * Why: the handler's chain logic (seq, prev_hash, effect pairing) must be provable
 *   without a database, and the concurrency guarantee (twenty simultaneous hook posts
 *   still produce one gap-free chain) must hold in whatever backend replaces this. It
 *   queues appends per run so each `build` sees the previous append's result, and
 *   discards a failed `build` so a half-written pair of receipts can never exist.
 *   Nothing persists; it is the test double and the reference for the sqlite adapter.
 *
 * Exports: createMemoryReceiptLog().
 * Depends on: @forge/tools (Receipt types), types/hook-handler. No IO.
 */

import type { DecisionReceipt, Receipt } from '@forge/tools';
import type { ChainView, ReceiptLog } from '#/types/hook-handler.types.js';

function viewOf(chain: readonly Receipt[]): ChainView {
  const decisions = chain.filter((r): r is DecisionReceipt => r.kind === 'decision');
  const done = new Set(
    chain.flatMap((r) => (r.kind === 'effect' ? [r.decision_id] : [])),
  );
  const open = (d: DecisionReceipt): boolean => !done.has(d.id);
  return {
    last: chain.at(-1) ?? null,
    lastSeq: decisions.at(-1)?.seq ?? 0,
    openDecision: (id) => decisions.find((d) => d.id === id && open(d)) ?? null,
    latestOpenDecision: (tool) =>
      [...decisions].reverse().find((d) => d.tool === tool && open(d)) ?? null,
  };
}

export function createMemoryReceiptLog(): ReceiptLog {
  const chains = new Map<string, Receipt[]>();
  const tails = new Map<string, Promise<unknown>>();

  return {
    append(runId, build) {
      const previous = tails.get(runId) ?? Promise.resolve();
      const next = previous.then(() => {
        const chain = chains.get(runId) ?? [];
        const added = build(viewOf(chain));
        chains.set(runId, [...chain, ...added]);
        return added;
      });
      // A failed append must not wedge the queue for later callers.
      tails.set(
        runId,
        next.catch(() => undefined),
      );
      return next;
    },
    list: async (runId) => [...(chains.get(runId) ?? [])],
  };
}
