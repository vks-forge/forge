/**
 * Chain check tests — pin that evidence tampering and missing receipts fail G1.
 *
 * Why: every other G1 check trusts the receipts. If a forged or edited chain passed, or a
 *   tool call that bypassed the hook went unnoticed, claims could be backed by invented
 *   evidence; if a missing run secret read as success the gate would pass blind.
 *
 * Pins: valid chain passes, wrong secret and edited row fail, tool call without a
 *   decision fails, null secret is `failed` with the restart finding (never passed, never a parking `error`).
 * Depends on: domain/chain-check, helpers/fixtures.
 */

import { describe, expect, it } from 'vitest';
import { checkChain } from '#/domain/chain-check.js';
import { SECRET, chain } from '#tests/helpers/fixtures.js';

const calls = [{ id: 'c1', tool: 'edit', resource: 'a.ts' }];

describe('checkChain', () => {
  it('passes a valid chain whose tool calls all have receipts', () => {
    const out = checkChain(chain(calls), [{ callId: 'c1', name: 'Edit' }], SECRET);

    expect(out.status).toBe('passed');
  });

  it('fails when the secret does not match the chain', () => {
    const out = checkChain(chain(calls), [], 'a-different-secret-0123456789-0123456789');

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('broken at index 0');
  });

  it('reports error when the secret is too weak to verify with', () => {
    const out = checkChain(chain(calls), [], 'short');

    expect(out.status).toBe('error');
  });

  it('fails when a receipt field was edited', () => {
    const receipts = chain(calls).map((r) =>
      r.kind === 'decision' ? { ...r, resource: 'evil.ts' } : r,
    );

    const out = checkChain(receipts, [], SECRET);

    expect(out.status).toBe('failed');
  });

  it('fails a tool call with no decision receipt', () => {
    const out = checkChain(chain(calls), [{ callId: 'ghost', name: 'Bash' }], SECRET);

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('ghost');
  });

  it('fails, not errors, when the run secret is gone, so the ticket is re-run (M6)', () => {
    const out = checkChain(chain(calls), [], null);

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toBe(
      'Receipt chain unverifiable after restart (the run secret is gone); re-running the ticket.',
    );
  });
});
