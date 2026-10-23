/**
 * Pins rule layering: layers only tighten, and the managed deny layer cannot be overridden.
 *
 * Why: a project file or a lane grant must never be able to loosen a floor or the
 * operator's managed deny. If a later layer could flip an earlier deny to allow, any
 * checked-in config would be a way around policy.
 *
 * Pins: layers only tighten, managed deny layer.
 * Depends on: domain/rules, domain/grants, helpers/rule-eval, helpers/fixtures, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { evaluateShell, evaluateToolRules } from '#/domain/rules.js';
import { tokenizeShell } from '#/domain/tokenizer.js';
import { grant, testGrant } from '#tests/helpers/fixtures.js';
import { sh, rule } from '#tests/helpers/rule-eval.js';

describe('layers only tighten', () => {
  it('a project allow cannot loosen an ask or a deny from the lane', () => {
    expect(
      sh('standard', 'pnpm add zod', [rule('shell', 'pnpm add *', 'allow')]).effect,
    ).toBe('ask');

    expect(
      sh('express', 'pnpm add zod', [rule('shell', 'pnpm add *', 'allow')]).effect,
    ).toBe('deny');

    expect(sh('standard', 'echo hi', [rule('shell', 'echo*', 'allow')]).effect).toBe(
      'ask',
    );
  });

  it('a project deny or ask tightens an allow', () => {
    expect(
      sh('standard', 'pnpm test', [rule('shell', 'pnpm test*', 'deny')]).effect,
    ).toBe('deny');

    expect(sh('standard', 'pnpm test', [rule('shell', 'pnpm test*', 'ask')]).effect).toBe(
      'ask',
    );
  });

  it('a ticket layer tightens further', () => {
    const eff = testGrant(
      'standard',
      undefined,
      grant({ rules: [rule('shell', 'ls*', 'deny')] }),
    );

    const t = tokenizeShell('ls -la', 'bash');
    if (!t.ok) {
      throw new Error('fixture');
    }

    expect(evaluateShell(eff, t.value, 'bash').effect).toBe('deny');
  });
});

describe('managed deny layer', () => {
  const managed = [
    rule('shell', 'curl*', 'deny'),
    rule('web_fetch', 'https://evil.*', 'deny'),
  ];

  it('applies operator rules that no project or ticket allow can override', () => {
    const eff = testGrant(
      'full',
      grant({ rules: [rule('shell', 'curl*', 'allow')] }),
      grant({ rules: [rule('shell', 'curl*', 'allow')] }),
      managed,
    );

    const t = tokenizeShell('curl https://x', 'bash');
    if (!t.ok) {
      throw new Error('fixture');
    }

    expect(evaluateShell(eff, t.value, 'bash')).toMatchObject({
      effect: 'deny',
      reason: 'managed_deny',
    });

    expect(evaluateToolRules(eff, 'web_fetch', 'https://evil.com/a')).toMatchObject({
      effect: 'deny',
      reason: 'managed_deny',
    });

    expect(evaluateToolRules(eff, 'web_fetch', 'https://docs.good.com/a').effect).toBe(
      'allow',
    );
  });

  it('keeps a project or ticket deny and a banned host above the default web allow', () => {
    const eff = testGrant(
      'full',
      grant({ rules: [rule('web_fetch', 'https://blocked.*', 'deny')] }),
      grant({ rules: [rule('web_fetch', 'https://nope.*', 'deny')] }),
      managed,
    );

    expect(evaluateToolRules(eff, 'web_fetch', 'https://blocked.dev/a').effect).toBe(
      'deny',
    );

    expect(evaluateToolRules(eff, 'web_fetch', 'https://nope.dev/a').effect).toBe('deny');
    expect(evaluateToolRules(eff, 'web_fetch', 'https://evil.com/a').reason).toBe(
      'managed_deny',
    );
  });
});
