/**
 * Pins the receipt chain across a resume: one segment per run secret generation.
 *
 * Why: after a server restart a run continues under a new secret (d-0100). The receipts the
 *   first process signed must still be provable, and the new process must not be able to
 *   rewrite them. The `resumed` receipt is the join: it links to the last receipt of the
 *   earlier generation and is signed with the new secret. If a missing secret, a dropped
 *   link, a skipped generation or a segment signed with the wrong generation's secret passed
 *   verification, a Worker run could be spliced together from unrelated evidence.
 *
 * Pins: makeResumedReceipt(), verifyGenerations(), and that verifyChain() on a single secret
 *   refuses a chain that resumed.
 * Depends on: domain/receipts, domain/receipt-verify, domain/admit, helpers/fixtures, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { admit } from '#/domain/admit.js';
import { verifyChain, verifyGenerations } from '#/domain/receipt-verify.js';
import {
  makeDecisionReceipt,
  makeEffectReceipt,
  makeResumedReceipt,
} from '#/domain/receipts.js';
import type { Receipt } from '#/schemas/receipt.js';
import { sha256Hex } from '#/shared/hmac.js';
import { call, makeCtx } from '#tests/helpers/fixtures.js';

const S1 = 'generation-one-secret-0123456789abcdef';
const S2 = 'generation-two-secret-0123456789abcdef';
const S3 = 'generation-three-secret-0123456789abcd';
const TS = '2026-10-13T00:00:00.000Z';

const secrets: Record<number, string> = { 1: S1, 2: S2, 3: S3 };
const secretFor = (g: number): string | null => secrets[g] ?? null;

/** Appends one decision and its effect under `secret`, continuing after `rows`. */
function addCall(rows: Receipt[], id: string, secret: string): void {
  const seq = rows.filter((r) => r.kind === 'decision').length + 1;
  const d = makeDecisionReceipt(
    {
      id,
      run_id: 'run-1',
      seq,
      decision: admit(makeCtx('standard'), call('read', { path: `${id}.ts` })),
      args_hash: sha256Hex(id),
      approver: 'auto',
      ts: TS,
    },
    rows.at(-1) ?? null,
    secret,
  );

  rows.push(d);
  rows.push(makeEffectReceipt(d, { state: 'read_completed', ts: TS }, d, secret));
}

function resume(rows: Receipt[], generation: number, secret: string): void {
  rows.push(
    makeResumedReceipt(
      { run_id: 'run-1', generation, ts: TS },
      rows.at(-1) ?? null,
      secret,
    ),
  );
}

function twoGenerations(): Receipt[] {
  const rows: Receipt[] = [];
  addCall(rows, 'a', S1);
  addCall(rows, 'b', S1);
  resume(rows, 2, S2);
  addCall(rows, 'c', S2);

  return rows;
}

describe('verifyGenerations', () => {
  it('verifies a chain with no resume as one generation', () => {
    const rows: Receipt[] = [];
    addCall(rows, 'a', S1);

    expect(verifyGenerations(rows, secretFor)).toEqual({
      ok: true,
      value: { receipts: 2, generations: 1 },
    });
  });

  it('verifies each segment under its own generation secret and checks the link', () => {
    const rows = twoGenerations();

    expect(verifyGenerations(rows, secretFor)).toEqual({
      ok: true,
      value: { receipts: 7, generations: 2 },
    });
  });

  it('links the resumed receipt to the last receipt of the earlier generation', () => {
    const rows = twoGenerations();
    const resumed = rows[4];

    expect(resumed).toMatchObject({ kind: 'resumed', generation: 2 });
    expect(resumed?.prev_hash).toBe(rows[3]?.hash);
    expect(rows[5]?.prev_hash).toBe(resumed?.hash);
  });

  it('allows a resume before any tool call (null link) and verifies three generations', () => {
    const rows: Receipt[] = [];
    resume(rows, 2, S2);
    addCall(rows, 'a', S2);
    resume(rows, 3, S3);
    addCall(rows, 'b', S3);

    expect(rows[0]?.prev_hash).toBeNull();
    expect(verifyGenerations(rows, secretFor)).toEqual({
      ok: true,
      value: { receipts: 6, generations: 3 },
    });
  });

  it('fails closed when a generation secret is missing', () => {
    const rows = twoGenerations();
    const without2 = (g: number): string | null => (g === 2 ? null : secretFor(g));
    const without1 = (g: number): string | null => (g === 1 ? null : secretFor(g));

    expect(verifyGenerations(rows, without2)).toMatchObject({
      ok: false,
      error: { index: 4, reason: 'missing_secret' },
    });

    expect(verifyGenerations(rows, without1)).toMatchObject({
      ok: false,
      error: { index: 0, reason: 'missing_secret' },
    });
  });

  it('rejects a segment signed with the previous generation secret (new process reusing the old key)', () => {
    const rows: Receipt[] = [];
    addCall(rows, 'a', S1);
    resume(rows, 2, S2);
    addCall(rows, 'b', S1);

    expect(verifyGenerations(rows, secretFor)).toMatchObject({
      ok: false,
      error: { index: 3, reason: 'hash' },
    });
  });

  it('rejects a resumed receipt signed with the old secret', () => {
    const rows: Receipt[] = [];
    addCall(rows, 'a', S1);
    resume(rows, 2, S1);

    expect(verifyGenerations(rows, secretFor)).toMatchObject({
      ok: false,
      error: { index: 2, reason: 'hash' },
    });
  });

  it('rejects a skipped generation and a repeated one', () => {
    const skipped: Receipt[] = [];
    addCall(skipped, 'a', S1);
    resume(skipped, 3, S3);

    const repeated = twoGenerations();
    resume(repeated, 2, S2);

    expect(verifyGenerations(skipped, secretFor)).toMatchObject({
      ok: false,
      error: { index: 2, reason: 'resume_link' },
    });

    expect(verifyGenerations(repeated, secretFor)).toMatchObject({
      ok: false,
      error: { reason: 'resume_link' },
    });
  });

  it('rejects a dropped receipt before the link and a broken link', () => {
    const rows = twoGenerations();
    const dropped = [...rows.slice(0, 2), ...rows.slice(3)];
    const relinked = rows.map((r, i) =>
      i === 4 ? { ...r, prev_hash: 'f'.repeat(64) } : r,
    );

    expect(verifyGenerations(dropped, secretFor).ok).toBe(false);
    expect(verifyGenerations(relinked, secretFor)).toMatchObject({
      ok: false,
      error: { index: 4, reason: 'prev_hash' },
    });
  });

  it('rejects an edited generation field (it is covered by the MAC)', () => {
    const rows = twoGenerations();
    const edited = rows.map((r) =>
      r.kind === 'resumed' ? { ...r, ts: '2026-10-14T00:00:00.000Z' } : r,
    );

    expect(verifyGenerations(edited, secretFor)).toMatchObject({
      ok: false,
      error: { index: 4, reason: 'hash' },
    });
  });
});

describe('verifyChain over a resumed chain', () => {
  it('refuses it: one secret cannot vouch for two generations', () => {
    expect(verifyChain(twoGenerations(), S1)).toMatchObject({
      ok: false,
      error: { index: 4, reason: 'missing_secret' },
    });
  });
});
