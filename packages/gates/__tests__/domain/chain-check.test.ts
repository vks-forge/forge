/**
 * Chain check tests — pin that evidence tampering and missing receipts fail G1.
 *
 * Why: every other G1 check trusts the receipts. If a forged or edited chain passed, or a
 *   tool call that bypassed the hook went unnoticed, claims could be backed by invented
 *   evidence; if a missing run secret read as success the gate would pass blind. A run that
 *   resumed after a restart has one chain segment per secret generation (d-0100): each must
 *   verify under its own generation's secret, the links between them must hold and the
 *   number of generations must match the run's. A missing secret, a spliced segment or a
 *   missing link must fail the gate, never pass it.
 *
 * Pins: valid chain passes, wrong secret and edited row fail, tool call without a
 *   decision fails, a missing secret is `failed` (never passed, never a parking `error`),
 *   multi-generation chains verify per segment, and every break across generations fails.
 * Depends on: domain/chain-check, helpers/fixtures.
 */

import { describe, expect, it } from 'vitest';
import { checkChain } from '#/domain/chain-check.js';
import { SECRET, chain, generationsChain } from '#tests/helpers/fixtures.js';

const calls = [{ id: 'c1', tool: 'edit', resource: 'a.ts' }];
const SECRET_2 = 'second-generation-secret-0123456789abcdef';
const one = (key: string | null): ReadonlyMap<number, string> =>
  new Map(key === null ? [] : [[1, key]]);

describe('checkChain', () => {
  it('passes a valid chain whose tool calls all have receipts', () => {
    const out = checkChain(chain(calls), [{ callId: 'c1', name: 'Edit' }], one(SECRET));

    expect(out.status).toBe('passed');
  });

  it('fails when the secret does not match the chain', () => {
    const out = checkChain(
      chain(calls),
      [],
      one('a-different-secret-0123456789-0123456789'),
    );

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('broken at index 0');
  });

  it('reports error when the secret is too weak to verify with', () => {
    const out = checkChain(chain(calls), [], one('short'));

    expect(out.status).toBe('error');
  });

  it('fails when a receipt field was edited', () => {
    const receipts = chain(calls).map((r) =>
      r.kind === 'decision' ? { ...r, resource: 'evil.ts' } : r,
    );

    const out = checkChain(receipts, [], one(SECRET));

    expect(out.status).toBe('failed');
  });

  it('fails a tool call with no decision receipt', () => {
    const out = checkChain(
      chain(calls),
      [{ callId: 'ghost', name: 'Bash' }],
      one(SECRET),
    );

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('ghost');
  });

  it('fails, not errors, when the run secret is gone, so the ticket is re-run (M6)', () => {
    const out = checkChain(chain(calls), [], one(null));

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toBe(
      'Receipt chain unverifiable: the run secret of generation 1 is gone; re-running the ticket.',
    );
  });
});

describe('checkChain across generations (d-0100)', () => {
  const first = { calls: [{ id: 'c1', tool: 'edit', resource: 'a.ts' }], secret: SECRET };
  const second = {
    calls: [{ id: 'c2', tool: 'edit', resource: 'b.ts' }],
    secret: SECRET_2,
  };

  const both = new Map([
    [1, SECRET],
    [2, SECRET_2],
  ]);

  it('passes a two-generation chain whose tool calls all have receipts', () => {
    const out = checkChain(
      generationsChain([first, second]),
      [
        { callId: 'c1', name: 'Edit' },
        { callId: 'c2', name: 'Edit' },
      ],
      both,
      2,
    );

    expect(out.status).toBe('passed');
    expect(out.details).toContain('2 generation(s)');
  });

  it('fails when the secret of an earlier generation is gone', () => {
    const out = checkChain(
      generationsChain([first, second]),
      [],
      new Map([[2, SECRET_2]]),
      2,
    );

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('generation 1 is gone');
  });

  it('fails when the secret of the resumed generation is gone', () => {
    const out = checkChain(
      generationsChain([first, second]),
      [],
      new Map([[1, SECRET]]),
      2,
    );

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('generation 2 is gone');
  });

  it('fails when the second segment was signed with the first generation secret', () => {
    const forged = generationsChain([first, { ...second, secret: SECRET }]);

    const out = checkChain(forged, [], both, 2);

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('broken at index');
  });

  it('fails when a receipt was cut out before the resume link', () => {
    const rows = generationsChain([first, second]);
    const cut = [...rows.slice(0, 1), ...rows.slice(2)];

    expect(checkChain(cut, [], both, 2).status).toBe('failed');
  });

  it('fails when the resumed link was removed (the segments are spliced)', () => {
    const rows = generationsChain([first, second]);
    const spliced = rows.filter((r) => r.kind !== 'resumed');

    expect(checkChain(spliced, [], both, 2).status).toBe('failed');
  });

  it('fails when the run reached a later generation than its chain records', () => {
    const out = checkChain(chain(calls), [], both, 2);

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('generation 2');
    expect(out.findings[0]?.message).toContain('records 1');
  });

  it('fails when the chain records more generations than the run row says', () => {
    const out = checkChain(generationsChain([first, second]), [], both, 1);

    expect(out.status).toBe('failed');
  });

  it('a resume before any tool call still verifies', () => {
    const rows = generationsChain([{ calls: [], secret: SECRET }, second]);

    expect(checkChain(rows, [], both, 2).status).toBe('passed');
  });
});
