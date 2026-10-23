/**
 * Pins bypass mode in admit(): lane asks are allowed, the hard floor still denies.
 *
 * Why: with "Bypass permissions" on (d-0183) a Worker is never stopped to ask the owner. If bypass
 * also lifted a floor, one prompt-injected ticket could read secrets, push or wipe files with
 * nobody watching. These tests fix both halves: ordinary asks become allow, every hard-floor rule
 * still denies, a deny stays a deny, and with the flag off nothing changes.
 *
 * Pins: admit() under grant.bypass, applyBypass(), HARD_FLOOR, effectiveGrant(bypass).
 * Depends on: domain/admit, domain/admit-bypass, domain/hard-floor, helpers/fixtures, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { admit } from '#/domain/admit.js';
import { applyBypass } from '#/domain/admit-bypass.js';
import { effectiveGrant } from '#/domain/grants.js';
import { HARD_FLOOR, isHardFloorRule } from '#/domain/hard-floor.js';
import type { AdmitDraft } from '#/types/admit.types.js';
import { FLOORS, call, makeCtx, testGrant } from '#tests/helpers/fixtures.js';

const sh = (command: string) => call('shell', { command }, { native: 'PowerShell' });

const bypassCtx = (lane: 'express' | 'standard' | 'full' = 'standard') =>
  makeCtx(lane, { grant: { ...testGrant(lane), bypass: true } });

const v = (c: ReturnType<typeof makeCtx>, k: ReturnType<typeof call>) => {
  const d = admit(c, k);

  return [d.decision, d.reason];
};

describe('bypass on: lane asks are allowed', () => {
  it.each([
    sh('pnpm add zod'),
    sh('echo hello'),
    call('edit', { path: 'migrations/0003.sql' }),
    call('edit', { path: 'CLAUDE.md' }),
  ])('%j -> allow bypass', (k) => {
    expect(v(bypassCtx(), k)).toEqual(['allow', 'bypass']);
  });

  it('records the bypass rule on the decision', () => {
    expect(admit(bypassCtx(), sh('pnpm add zod')).matched_rule).toBe('bypass');
  });

  it('also lifts an unattended Express ask', () => {
    expect(v(bypassCtx('express'), sh('echo hello'))).toEqual(['allow', 'bypass']);
  });

  it('keeps an inspector ask an ask', () => {
    const ctx = { ...bypassCtx(), inspectors: [() => ({ effect: 'ask' as const })] };

    expect(v(ctx, call('read', { path: 'src/a.ts' }))).toEqual([
      'ask',
      'inspector_raised',
    ]);
  });
});

describe('bypass on: the hard floor still denies', () => {
  it.each([
    sh('git push origin main'),
    sh('pnpm test && git push'),
    sh('npm publish'),
    sh('rm -rf /'),
    sh('rm -rf ~'),
    sh('env git push'),
    sh('bash -c "git push"'),
    call('read', { path: '.env' }),
    call('read', { path: '../outside.txt' }),
    call('write', { path: 'C:/Windows/x.txt' }),
    call('read', { path: '/forge-home/forge.db' }),
    call('read', { path: 'C:/Users/me/.claude/settings.json' }),
    call('edit', { path: '.git/config' }),
  ])('%j -> deny', (k) => {
    expect(v(bypassCtx(), k)[0]).toBe('deny');
  });

  it('keeps a plain deny (unknown tool) a deny', () => {
    expect(v(bypassCtx(), call('mcp__nope__x', {}))[0]).toBe('deny');
  });

  it('keeps a call denied by a project deny rule', () => {
    const grant = effectiveGrant(
      'standard',
      {
        deny: [],
        rules: [{ action: 'shell', resource: 'make deploy*', effect: 'deny' }],
        approved: [],
      },
      undefined,
      [],
      FLOORS,
      undefined,
      undefined,
      true,
    );

    expect(v(makeCtx('standard', { grant }), sh('make deploy'))[0]).toBe('deny');
  });
});

describe('hard floor table', () => {
  it.each(HARD_FLOOR.map((f) => [f.id, f.prefix, f.area] as const))(
    'an ask carrying %s (prefix %s, %s) becomes deny under bypass, never allow',
    (id) => {
      const rule = id.endsWith(':') || id.endsWith('#') ? `${id}7` : id;
      const draft: AdmitDraft = {
        decision: 'ask',
        reason: 'rule_ask',
        layer: 'rule',
        rule,
        findings: [],
      };

      const out = applyBypass(bypassCtx(), draft, false);

      expect(isHardFloorRule(rule)).toBe(true);
      expect(out.decision).toBe('deny');
    },
  );

  it('does not treat lane or project rule ids as floor', () => {
    expect(isHardFloorRule('lane:standard#3')).toBe(false);
    expect(isHardFloorRule('project#0')).toBe(false);
    expect(isHardFloorRule(null)).toBe(false);
  });
});

describe('bypass off or unreadable: unchanged', () => {
  it.each([[undefined], [false]])('flag %s keeps asks', (flag) => {
    const grant = {
      ...testGrant('standard'),
      ...(flag === undefined ? {} : { bypass: flag }),
    };

    expect(v(makeCtx('standard', { grant }), sh('pnpm add zod'))).toEqual([
      'ask',
      'rule_ask',
    ]);
  });

  it('only the literal true counts', () => {
    const grant = { ...testGrant('standard'), bypass: 'yes' as unknown as boolean };

    expect(v(makeCtx('standard', { grant }), sh('pnpm add zod'))[0]).toBe('ask');
  });

  it('effectiveGrant sets bypass only when asked', () => {
    expect(
      effectiveGrant('standard', undefined, undefined, [], FLOORS).bypass,
    ).toBeUndefined();

    expect(
      effectiveGrant(
        'standard',
        undefined,
        undefined,
        [],
        FLOORS,
        undefined,
        undefined,
        true,
      ).bypass,
    ).toBe(true);
  });
});

describe('fail closed', () => {
  it('an error inside admit under bypass is a deny', () => {
    const ctx = {
      ...bypassCtx(),
      inspectors: [
        () => {
          throw new Error('boom');
        },
      ],
    };

    expect(v(ctx, sh('pnpm add zod'))).toEqual(['deny', 'inspector_error']);
  });
});
