/**
 * Verifies a run's receipt chain, one secret per generation.
 *
 * Why: the independent gates and the Ticket screen must prove what a Worker was allowed to do
 *   and what it did without trusting the Worker or the harness. Every receipt is HMAC'd under a
 *   per-run secret and links to the one before, so editing, deleting, reordering or splicing a
 *   row fails at a named index. A run that survived a server restart signs under a new secret
 *   (d-0092, d-0100), so its chain is one segment per generation joined by `resumed` receipts:
 *   each segment is checked under its own generation's secret, the joins are checked, and a
 *   generation with no secret is a failure, never a pass. An effect is only meaningful for a
 *   call that was allowed, and once: a second effect or one on a denied decision is how a
 *   forged "it ran" would be slipped in, so the verifier rejects both.
 *
 * Exports: verifyChain(), verifyGenerations().
 * Depends on: @forge/core (Result), domain/receipt-mac, schemas/receipt, shared/hmac, types/receipts. No IO.
 */

import { err, ok } from '@forge/core';
import type { Result } from '@forge/core';
import { decisionBody, effectBody, mac, resumedBody } from '#/domain/receipt-mac.js';
import { Receipt } from '#/schemas/receipt.js';
import type { DecisionReceipt } from '#/schemas/receipt.js';
import { constantTimeEqual, sha256Hex } from '#/shared/hmac.js';
import type { ChainFailure, GenerationCheck, HmacKey } from '#/types/receipts.types.js';

/**
 * Verifies receipts given in append order, one secret per generation: `secretFor(g)` is
 * generation `g`'s secret or null when it is gone. A receipt whose generation has no secret
 * is a failure (`missing_secret`), so a lost secret can never read as a clean chain.
 * Returns the receipt and generation counts, or the first broken index and why. Truncating
 * the tail is not detectable from the chain alone; the run record's final receipt hash
 * covers that.
 */
export function verifyGenerations(
  rows: readonly unknown[],
  secretFor: (generation: number) => HmacKey | null,
): Result<GenerationCheck, ChainFailure> {
  const decisions = new Map<string, DecisionReceipt>();
  const closed = new Set<string>();
  let prev: string | null = null;
  let lastSeq: number | null = null;
  let generation = 1;
  for (const [index, raw] of rows.entries()) {
    const parsed = Receipt.safeParse(raw);
    if (!parsed.success) {
      return err({ index, reason: 'bad_schema' });
    }

    const r = parsed.data;
    if (r.prev_hash !== prev) {
      return err({ index, reason: 'prev_hash' });
    }

    if (r.kind === 'resumed' && r.generation !== generation + 1) {
      return err({ index, reason: 'resume_link' });
    }

    const key = secretFor(r.kind === 'resumed' ? r.generation : generation);
    if (key === null) {
      return err({ index, reason: 'missing_secret' });
    }

    let expected: string;
    if (r.kind === 'resumed') {
      generation = r.generation;
      expected = mac(
        key,
        r.prev_hash,
        r.generation,
        'resumed',
        sha256Hex(r.run_id),
        resumedBody(r),
      );
    } else if (r.kind === 'decision') {
      if (decisions.has(r.id)) {
        return err({ index, reason: 'duplicate_decision' });
      }

      if (lastSeq !== null && r.seq !== lastSeq + 1) {
        return err({ index, reason: 'seq' });
      }

      lastSeq = r.seq;
      decisions.set(r.id, r);
      expected = mac(key, r.prev_hash, r.seq, r.tool, r.args_hash, decisionBody(r));
    } else {
      const d = decisions.get(r.decision_id);
      if (!d) {
        return err({ index, reason: 'orphan_effect' });
      }

      // One effect per decision, and only for a call that was allowed to run.
      if (closed.has(d.id)) {
        return err({ index, reason: 'duplicate_effect' });
      }

      if (d.decision !== 'allow') {
        return err({ index, reason: 'effect_not_allowed' });
      }

      closed.add(d.id);
      expected = mac(key, r.prev_hash, d.seq, d.tool, d.args_hash, effectBody(r));
    }

    if (!constantTimeEqual(expected, r.hash)) {
      return err({ index, reason: 'hash' });
    }

    prev = r.hash;
  }

  return ok({ receipts: rows.length, generations: generation });
}

/**
 * Verifies a chain written under ONE secret (generation 1). A chain that resumed needs
 * `verifyGenerations`: one secret cannot vouch for a later generation, so it fails with
 * `missing_secret` at the `resumed` receipt.
 */
export function verifyChain(
  rows: readonly unknown[],
  runSecret: HmacKey,
): Result<number, ChainFailure> {
  const checked = verifyGenerations(rows, (g) => (g === 1 ? runSecret : null));

  return checked.ok ? ok(checked.value.receipts) : checked;
}
