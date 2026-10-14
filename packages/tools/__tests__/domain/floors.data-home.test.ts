/**
 * Pins: an unknown data home denies everything.
 *
 * Why: the data-home floor protects Forge's database, secrets and other runs' worktrees by
 *   absolute path, and that path is data handed in by the server. If it is missing, empty or
 *   relative (a wiring bug, a bad override), the floor cannot tell what to protect, so every
 *   path call and every listing must be refused instead of guessing and leaving the folder open.
 *
 * Pins: admit() and evaluateToolRules() with a missing or non-absolute data home.
 * Depends on: domain/admit, domain/grants, domain/rules, helpers/fixtures, vitest. No IO.
 */

import type { Lane } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { admit } from '#/domain/admit.js';
import { effectiveGrant } from '#/domain/grants.js';
import { evaluateToolRules } from '#/domain/rules.js';
import { call, makeCtx } from '#tests/helpers/fixtures.js';

const LANES: readonly Lane[] = ['express', 'standard', 'full'];
const grantFor = (lane: Lane, dataHome: string) =>
  effectiveGrant(lane, undefined, undefined, [], { dataHome });

describe('the data home is data: unknown means everything is denied', () => {
  it.each(['', '   ', 'relative/forge', 'C:forge', '.'])(
    'data home %j denies every path tool and every listing',
    (home) => {
      for (const lane of LANES) {
        const ctx = makeCtx(lane, { grant: grantFor(lane, home) });

        expect(admit(ctx, call('read', { file_path: 'src/a.ts' })).decision).toBe('deny');
        expect(admit(ctx, { phase: 'list', tool: 'read' }).decision).toBe('deny');
        expect(
          evaluateToolRules(grantFor(lane, home), 'read', 'src/a.ts', '/work/repo'),
        ).toMatchObject({ effect: 'deny', reason: 'managed_deny' });
      }
    },
  );

  it('an effective grant built without floors has no data home and denies', () => {
    const eff = effectiveGrant('standard');

    expect(evaluateToolRules(eff, 'read', 'src/a.ts', '/work/repo').effect).toBe('deny');
  });
});
