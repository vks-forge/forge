/**
 * Pins the receipt chain: HMAC'd, hash-linked decision and effect rows.
 *
 * Why: the gates trust these rows instead of the Worker's account of its own actions.
 * Any edit, deletion, reordering, splice or key change must be detected at a named row,
 * and the tamper property is checked on every column so adding a field to a row without
 * covering it by the MAC would fail here.
 *
 * Pins: makeDecisionReceipt(), makeEffectReceipt(), verifyChain().
 * Depends on: domain/receipts, domain/receipt-verify, domain/admit, helpers/fixtures, fast-check, vitest. No IO.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { admit } from '#/domain/admit.js';
import { verifyChain } from '#/domain/receipt-verify.js';
import { makeDecisionReceipt, makeEffectReceipt } from '#/domain/receipts.js';
import type { DecisionReceipt, Receipt } from '#/schemas/receipt.js';
import { sha256Hex } from '#/shared/hmac.js';
import { call, makeCtx } from '#tests/helpers/fixtures.js';

const SECRET = 'run-secret-0123456789abcdef-0123456789';
const TS = '2026-10-13T00:00:00.000Z';

function buildChain(secret: string, calls = 3): Receipt[] {
  const ctx = makeCtx('standard');
  const rows: Receipt[] = [];
  for (let seq = 1; seq <= calls; seq++) {
    const decision = admit(ctx, call('read', { path: `f${seq}.ts` }));
    const d = makeDecisionReceipt(
      {
        id: `d-${seq}`,
        run_id: 'run-1',
        seq,
        decision,
        version: '1',
        schema_hash: `sha256:${'b'.repeat(64)}`,
        args_hash: sha256Hex(`args-${seq}`),
        approver: 'auto',
        ts: TS,
      },
      rows.at(-1) ?? null,
      secret,
    );

    rows.push(d);
    rows.push(
      makeEffectReceipt(
        d,
        {
          state: 'read_completed',
          result_hash: sha256Hex(`res-${seq}`),
          duration_ms: 3,
          cost_usd: 0,
          ts: TS,
        },
        d,
        secret,
      ),
    );
  }

  return rows;
}

describe('receipt chain', () => {
  it('verifies an untouched chain and returns its length', () => {
    expect(verifyChain(buildChain(SECRET), SECRET)).toEqual({ ok: true, value: 6 });
    expect(verifyChain([], SECRET)).toEqual({ ok: true, value: 0 });
  });

  it('links each row to the previous hash, starting from null', () => {
    const rows = buildChain(SECRET);
    expect(rows[0]?.prev_hash).toBeNull();
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]?.prev_hash).toBe(rows[i - 1]?.hash);
    }
  });

  it('mirrors the decision fields into the db-shaped row', () => {
    const d = buildChain(SECRET)[0];
    expect(d).toMatchObject({
      kind: 'decision',
      tool: 'read',
      decision: 'allow',
      layer: 'rule',
      reason: 'rule_allow',
      enforced_by: 'harness',
      approver: 'auto',
      finding_ids: [],
    });
  });

  it('is rejected under the wrong run secret', () => {
    expect(
      verifyChain(buildChain(SECRET), 'other-run-secret-0123456789abcdef-0123'),
    ).toMatchObject({
      ok: false,
      error: { index: 0, reason: 'hash' },
    });
  });

  it('detects deletion of a middle row, a dropped head and a reorder', () => {
    const rows = buildChain(SECRET);
    expect(verifyChain([...rows.slice(0, 2), ...rows.slice(3)], SECRET)).toMatchObject({
      ok: false,
      error: { index: 2, reason: 'prev_hash' },
    });

    expect(verifyChain(rows.slice(1), SECRET)).toMatchObject({
      ok: false,
      error: { index: 0 },
    });

    const swapped = [...rows];
    [swapped[2], swapped[3]] = [swapped[3] as Receipt, swapped[2] as Receipt];
    expect(verifyChain(swapped, SECRET).ok).toBe(false);
  });

  it('detects a forged row that is correctly linked but signed with another key', () => {
    const rows = buildChain(SECRET);
    const forged = buildChain('attacker-secret-0123456789abcdef-012345', 1)[0] as Receipt;
    expect(
      verifyChain([...rows, { ...forged, prev_hash: rows.at(-1)?.hash ?? null }], SECRET)
        .ok,
    ).toBe(false);
  });

  it('rejects an effect with no preceding decision, a duplicate decision, a seq gap and junk', () => {
    const rows = buildChain(SECRET);
    const d1 = rows[0] as DecisionReceipt;
    const e1 = rows[1] as Receipt;
    expect(verifyChain([e1], SECRET)).toMatchObject({
      ok: false,
      error: { reason: 'prev_hash' },
    });

    const lone = makeEffectReceipt(d1, { state: 'uncertain', ts: TS }, null, SECRET);
    expect(verifyChain([lone], SECRET)).toMatchObject({
      ok: false,
      error: { reason: 'orphan_effect' },
    });

    const dup = makeDecisionReceipt(
      {
        id: 'd-1',
        run_id: 'run-1',
        seq: 2,
        decision: admit(makeCtx('standard'), call('read', {})),
        args_hash: sha256Hex('a'),
        ts: TS,
      },
      e1,
      SECRET,
    );

    expect(verifyChain([d1, e1, dup], SECRET)).toMatchObject({
      ok: false,
      error: { reason: 'duplicate_decision' },
    });

    const gap = makeDecisionReceipt(
      {
        id: 'd-9',
        run_id: 'run-1',
        seq: 5,
        decision: admit(makeCtx('standard'), call('read', {})),
        args_hash: sha256Hex('a'),
        ts: TS,
      },
      e1,
      SECRET,
    );

    expect(verifyChain([d1, e1, gap], SECRET)).toMatchObject({
      ok: false,
      error: { reason: 'seq' },
    });

    expect(verifyChain([{ kind: 'nope' }], SECRET)).toMatchObject({
      ok: false,
      error: { reason: 'bad_schema' },
    });
  });

  it('rejects a second effect for the same decision', () => {
    const rows = buildChain(SECRET, 1);
    const d = rows[0] as DecisionReceipt;
    const second = makeEffectReceipt(
      d,
      { state: 'mutation_committed', ts: TS },
      rows[1] as Receipt,
      SECRET,
    );

    expect(verifyChain([...rows, second], SECRET)).toMatchObject({
      ok: false,
      error: { index: 2, reason: 'duplicate_effect' },
    });
  });

  it.each([
    ['deny', call('read', { path: '.env' })],
    ['ask', call('shell', { command: 'echo hi' }, { native: 'PowerShell' })],
  ])('rejects an effect for a decision whose verdict was %s', (_v, c) => {
    const decision = admit(makeCtx('standard'), c);
    expect(decision.decision).not.toBe('allow');
    const d = makeDecisionReceipt(
      {
        id: 'd-1',
        run_id: 'run-1',
        seq: 1,
        decision,
        args_hash: sha256Hex('a'),
        ts: TS,
      },
      null,
      SECRET,
    );

    const e = makeEffectReceipt(d, { state: 'mutation_committed', ts: TS }, d, SECRET);
    expect(verifyChain([d, e], SECRET)).toMatchObject({
      ok: false,
      error: { index: 1, reason: 'effect_not_allowed' },
    });

    expect(verifyChain([d], SECRET)).toEqual({ ok: true, value: 1 });
  });

  it('breaks when any single field of any row is tampered with', () => {
    const rows = buildChain(SECRET);
    fc.assert(
      fc.property(fc.nat(rows.length - 1), fc.nat(40), (rowIdx, fieldIdx) => {
        const row = rows[rowIdx] as Record<string, unknown>;
        const keys = Object.keys(row);
        const key = keys[fieldIdx % keys.length] as string;
        const v = row[key];
        const mutated =
          typeof v === 'string'
            ? `${v}x`
            : typeof v === 'number'
              ? v + 1
              : Array.isArray(v)
                ? [...v, 'x']
                : v === null
                  ? 'x'
                  : 'x';

        const tampered = rows.map((r, i) =>
          i === rowIdx ? { ...r, [key]: mutated } : r,
        );

        expect(verifyChain(tampered, SECRET).ok).toBe(false);
      }),
      { numRuns: 300 },
    );
  });
});

describe('receipt resource', () => {
  const make = (resource?: string | null): DecisionReceipt =>
    makeDecisionReceipt(
      {
        id: 'd-1',
        run_id: 'run-1',
        seq: 1,
        decision: admit(makeCtx('standard'), call('read', { path: 'a.ts' })),
        args_hash: sha256Hex('a'),
        ts: TS,
        ...(resource === undefined ? {} : { resource }),
      },
      null,
      SECRET,
    );

  it('carries the resource the writer supplies and defaults to null', () => {
    expect(make('src/a.ts').resource).toBe('src/a.ts');
    expect(make().resource).toBeNull();
    expect(make(null).resource).toBeNull();
  });

  it('is covered by the MAC: editing or adding a resource breaks the chain at that row', () => {
    const named = make('src/a.ts');
    expect(verifyChain([named], SECRET)).toEqual({ ok: true, value: 1 });
    expect(verifyChain([{ ...named, resource: 'src/b.ts' }], SECRET)).toMatchObject({
      ok: false,
      error: { index: 0, reason: 'hash' },
    });

    expect(verifyChain([{ ...make(), resource: 'src/a.ts' }], SECRET)).toMatchObject({
      ok: false,
      error: { index: 0, reason: 'hash' },
    });
  });
});
