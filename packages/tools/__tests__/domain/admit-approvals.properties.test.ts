/**
 * Pins, as a property, that approvals can only turn an `ask` into an answer.
 *
 * Why: approvals come from a person clicking, stored as data. Whatever those answers are
 * (any mix of once, denied and always rules, for any call), a call that policy already
 * denied must stay denied with the same reason, a call it already allowed must be unchanged,
 * and Express must ignore them entirely. If this failed, a stored answer could widen a grant.
 *
 * Pins: admit() with random ctx.approvals and grant.approved.
 * Depends on: domain/admit, domain/approval-key, helpers/fixtures, fast-check, vitest. No IO.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { admit } from '#/domain/admit.js';
import { approvalKey } from '#/domain/approval-key.js';
import type { AdmitCall, AdmitContext } from '#/types/admit.types.js';
import { call, grant, makeCtx } from '#tests/helpers/fixtures.js';

const sh = (command: string): AdmitCall =>
  call('shell', { command }, { native: 'PowerShell' });

const CALLS: AdmitCall[] = [
  sh('cargo add serde'),
  sh('git push'),
  sh('git status'),
  sh('go get x && git push'),
  sh('bash -c "ls"'),
  sh('make test'),
  call('edit', { file_path: 'prisma/migrations/1.sql' }),
  call('edit', { file_path: 'CLAUDE.md' }),
  call('edit', { file_path: 'src/a.ts' }),
  call('read', { path: '.env' }),
  call('read', { path: 'src/a.ts' }),
  call('mcp__forge__web_fetch', { url: 'http://127.0.0.1/x' }),
];

const RULES = [
  ['shell', 'cargo add serde'],
  ['shell', 'make test'],
  ['edit', 'prisma/migrations/**'],
  ['edit', 'src/**'],
  ['shell', 'git push'],
  ['read', '.env'],
] as const;

const arb = fc.record({
  lane: fc.constantFrom('express', 'standard', 'full'),
  index: fc.integer({ min: 0, max: CALLS.length - 1 }),
  mode: fc.constantFrom('once', 'denied', 'both'),
  rules: fc.subarray([...RULES]),
});

describe('approvals never change a deny or an allow', () => {
  it('holds for random answers and approved rules', () => {
    fc.assert(
      fc.property(arb, ({ lane, index, mode, rules }) => {
        const c = CALLS[index] as AdmitCall;
        const base = admit(makeCtx(lane), c);
        const key = approvalKey(makeCtx(lane), c) ?? 'none';
        const ref = [{ key, ref: 'int-1' }];
        const project = grant({
          approved: rules.map(([action, resource], i) => ({
            id: `r${i}`,
            action,
            resource,
            effect: 'allow' as const,
            created_at: '2026-10-20T10:00:00.000Z',
            source: { ticket_id: 'FG-1', interaction_id: 'int-1' },
          })),
        });

        let ctx: AdmitContext;
        try {
          ctx = {
            ...makeCtx(lane, {}, { project }),
            approvals: {
              once: mode === 'denied' ? [] : ref,
              denied: mode === 'once' ? [] : ref,
            },
          };
        } catch {
          // A rule list that fails validation (a protected path, say) is refused at build time.
          return;
        }

        const got = admit(ctx, c);
        if (base.decision !== 'ask' || lane === 'express') {
          expect(got).toEqual(base);
        }
      }),
      { numRuns: 300 },
    );
  });
});
