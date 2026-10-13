/**
 * In-memory ReceiptLog: per-run chains with serialised, atomic appends.
 *
 * Why: the hook handler's chain logic (seq, prev_hash, effect pairing) must be provable
 *   without a database, and the guarantee that twenty simultaneous hook posts still
 *   produce one gap-free chain must hold in whatever backend runs in production. This is
 *   the fast test double and the reference for the SQLite log: it queues appends per
 *   run so each `build` sees the previous append's result, discards a failed `build`,
 *   and rejects the same receipts SQLite's constraints reject (another run's receipt,
 *   a reused decision id or seq, an effect with no decision, a second effect for one
 *   decision), storing none of a batch if any member is refused, so a half-written pair
 *   can never exist. Nothing persists, and like the SQLite log it never holds the run's
 *   HMAC secret.
 *
 * Exports: createMemoryReceiptLog().
 * Depends on: @forge/tools (Receipt schema and port types), @forge/core. No IO.
 */

import { InvalidInputError } from '@forge/core';
import { Receipt } from '@forge/tools';
import type { ChainView, DecisionReceipt, ReceiptLog } from '@forge/tools';

function viewOf(chain: readonly Receipt[]): ChainView {
  const decisions = chain.filter((r): r is DecisionReceipt => r.kind === 'decision');
  const done = new Set(
    chain.flatMap((r) => (r.kind === 'effect' ? [r.decision_id] : [])),
  );

  const open = (d: DecisionReceipt): boolean => !done.has(d.id);

  return {
    last: chain.at(-1) ?? null,
    lastSeq: decisions.reduce((max, d) => Math.max(max, d.seq), 0),
    openDecision: (id) => decisions.find((d) => d.id === id && open(d)) ?? null,
    latestOpenDecision: (tool) =>
      [...decisions].reverse().find((d) => d.tool === tool && open(d)) ?? null,
  };
}

export function createMemoryReceiptLog(): ReceiptLog {
  const chains = new Map<string, Receipt[]>();
  // SQLite keys `tool_decisions.id` globally, so this does too.
  const decisionIds = new Set<string>();
  const tails = new Map<string, Promise<unknown>>();

  /** Mirrors the SQLite constraints for `added` appended to `chain`; throws on a violation. */
  function check(runId: string, chain: readonly Receipt[], added: readonly Receipt[]) {
    const ids = new Set(decisionIds);
    const seqs = new Set(chain.flatMap((r) => (r.kind === 'decision' ? [r.seq] : [])));
    const effects = new Set(
      chain.flatMap((r) => (r.kind === 'effect' ? [r.decision_id] : [])),
    );

    const own = new Set(chain.flatMap((r) => (r.kind === 'decision' ? [r.id] : [])));
    for (const r of added) {
      if (r.kind === 'decision') {
        if (r.run_id !== runId) {
          throw new InvalidInputError(
            `receipt ${r.id} belongs to run ${r.run_id}, not ${runId}`,
          );
        }

        if (ids.has(r.id) || seqs.has(r.seq)) {
          throw new InvalidInputError(`duplicate decision ${r.id} (seq ${r.seq})`);
        }

        ids.add(r.id);
        own.add(r.id);
        seqs.add(r.seq);
      } else {
        if (!own.has(r.decision_id) || effects.has(r.decision_id)) {
          throw new InvalidInputError(
            `effect receipt for ${r.decision_id} has no open decision in run ${runId}`,
          );
        }

        effects.add(r.decision_id);
      }
    }
  }

  return {
    append(runId, build) {
      const previous = tails.get(runId) ?? Promise.resolve();
      const next = previous.then(() => {
        const chain = chains.get(runId) ?? [];
        const added = build(viewOf(chain)).map((r) => Receipt.parse(r));
        check(runId, chain, added);
        chains.set(runId, [...chain, ...added]);
        for (const r of added) {
          if (r.kind === 'decision') {
            decisionIds.add(r.id);
          }
        }

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
