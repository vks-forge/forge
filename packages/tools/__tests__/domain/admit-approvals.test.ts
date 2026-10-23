/**
 * Pins how the owner's answers settle an `ask` inside admit().
 *
 * Why: on Standard and Full a call the lane marks `ask` waits for the owner. The answer must
 * let exactly that call through (once), refuse it for good (deny) or lift the lane's ask for
 * a narrow stored rule (always), and nothing more: a deny, a floor or an unattended lane must
 * never be turned into an allow by an approval, or one click would widen what a Worker may
 * do. The rules are language-neutral: commands are opaque segments.
 *
 * Pins: admit() with ctx.approvals and grant.approved; alwaysRuleFor().
 * Depends on: domain/admit, domain/approval-always, domain/approval-key, helpers/fixtures, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { admit } from '#/domain/admit.js';
import { alwaysRuleFor } from '#/domain/approval-always.js';
import { approvalKey } from '#/domain/approval-key.js';
import type { Decision } from '#/schemas/decision.js';
import type { AdmitCall, AdmitContext } from '#/types/admit.types.js';
import { call, grant, makeCtx } from '#tests/helpers/fixtures.js';

const sh = (command: string) => call('shell', { command }, { native: 'PowerShell' });
const edit = (file_path: string) => call('edit', { file_path });
const verdict = (d: Decision) => [d.decision, d.reason];

const approved = (action: string, resource: string, id = 'a1') => ({
  id,
  action,
  resource,
  effect: 'allow' as const,
  created_at: '2026-10-20T10:00:00.000Z',
  source: { ticket_id: 'FG-1', interaction_id: 'int-1' },
});

const withAnswers = (
  ctx: AdmitContext,
  c: AdmitCall,
  kind: 'once' | 'denied',
): AdmitContext => ({
  ...ctx,
  approvals: {
    once: [],
    denied: [],
    [kind]: [{ key: approvalKey(ctx, c) as string, ref: 'int-9' }],
  },
});

describe('allow once', () => {
  const c = sh('cargo add serde');
  const base = makeCtx('standard');

  it('allows exactly the approved call and records the interaction', () => {
    const d = admit(withAnswers(base, c, 'once'), c);

    expect(verdict(d)).toEqual(['allow', 'approved_once']);
    expect(d.layer).toBe('approval');
    expect(d.matched_rule).toBe('approval:int-9');
  });

  it('still asks for another command or another resource', () => {
    const ctx = withAnswers(base, c, 'once');

    expect(verdict(admit(ctx, sh('cargo add evil')))).toEqual(['ask', 'rule_ask']);
    expect(verdict(admit(ctx, sh('cargo add serde && cargo add evil')))).toEqual([
      'ask',
      'rule_ask',
    ]);
  });

  it('applies to an edit under a sensitive folder', () => {
    const e = edit('prisma/migrations/001.sql');
    const d = admit(withAnswers(makeCtx('full'), e, 'once'), e);

    expect(verdict(d)).toEqual(['allow', 'approved_once']);
  });

  it('is ignored by Express and by an unattended context', () => {
    const e = edit('prisma/migrations/001.sql');

    expect(verdict(admit(withAnswers(makeCtx('express'), e, 'once'), e))[0]).toBe('deny');
    const unattended = withAnswers(makeCtx('standard', { unattended: true }), c, 'once');

    expect(verdict(admit(unattended, c))).toEqual(['deny', 'unattended']);
  });

  it('never lifts a deny or a floor', () => {
    const push = sh('git push');
    const env = call('read', { path: '.env' });

    expect(verdict(admit(withAnswers(base, push, 'once'), push))).toEqual([
      'deny',
      'managed_deny',
    ]);

    expect(admit(withAnswers(base, env, 'once'), env).decision).toBe('deny');
  });

  it('does not lift a project deny rule', () => {
    const ctx = makeCtx(
      'standard',
      {},
      {
        project: grant({
          rules: [
            { action: 'shell', resource: c.input?.['command'] as string, effect: 'deny' },
          ],
        }),
      },
    );

    expect(verdict(admit(withAnswers(ctx, c, 'once'), c))).toEqual(['deny', 'rule_deny']);
  });
});

describe('deny answer', () => {
  it('refuses the call without asking again and leaves others alone', () => {
    const c = sh('cargo add serde');
    const ctx = withAnswers(makeCtx('standard'), c, 'denied');
    const d = admit(ctx, c);

    expect(verdict(d)).toEqual(['deny', 'approval_denied']);
    expect(d.matched_rule).toBe('approval:int-9');
    expect(verdict(admit(ctx, sh('cargo add other')))).toEqual(['ask', 'rule_ask']);
  });
});

describe('always rules (project approved list)', () => {
  const project = (...rules: ReturnType<typeof approved>[]) => ({
    project: grant({ approved: rules }),
  });

  it('lifts the lane ask for the exact command only', () => {
    const ctx = makeCtx('standard', {}, project(approved('shell', 'cargo add serde')));
    const d = admit(ctx, sh('cargo add serde'));

    expect(verdict(d)).toEqual(['allow', 'approved_always']);
    expect(d.matched_rule).toBe('project:approved#a1');
    expect(verdict(admit(ctx, sh('cargo add evil')))).toEqual(['ask', 'rule_ask']);
    expect(verdict(admit(ctx, sh('cargo add serde && git push')))[0]).toBe('deny');
  });

  it('covers a sensitive folder but never a protected path inside it', () => {
    const ctx = makeCtx('full', {}, project(approved('edit', 'prisma/migrations/**')));

    expect(verdict(admit(ctx, edit('prisma/migrations/001.sql')))).toEqual([
      'allow',
      'approved_always',
    ]);

    expect(admit(ctx, edit('prisma/migrations/CLAUDE.md')).decision).toBe('ask');
    expect(admit(ctx, edit('prisma/other/001.sql')).decision).toBe('allow');
  });

  it('is beaten by a project deny and ignored on Express', () => {
    const denied = grant({
      approved: [approved('shell', 'cargo add serde')],
      rules: [{ action: 'shell', resource: 'cargo add serde', effect: 'deny' }],
    });

    expect(
      verdict(admit(makeCtx('standard', {}, { project: denied }), sh('cargo add serde'))),
    ).toEqual(['deny', 'rule_deny']);

    const express = makeCtx(
      'express',
      {},
      project(approved('edit', 'prisma/migrations/**')),
    );

    expect(admit(express, edit('prisma/migrations/001.sql')).decision).toBe('deny');
  });

  it('does not lift an inspector or budget ask', () => {
    const withRule = makeCtx(
      'standard',
      { inspectors: [() => ({ effect: 'ask' })] },
      project(approved('shell', 'cargo add serde')),
    );

    expect(verdict(admit(withRule, sh('cargo add serde')))).toEqual(['ask', 'rule_ask']);
  });

  it('ignores a ticket-grant approved list', () => {
    const ctx = makeCtx(
      'standard',
      {},
      {
        ticket: grant({ approved: [approved('shell', 'cargo add serde')] }),
      },
    );

    expect(verdict(admit(ctx, sh('cargo add serde')))).toEqual(['ask', 'rule_ask']);
  });
});

describe('alwaysRuleFor', () => {
  const ask = { decision: 'ask', reason: 'rule_ask' } as const;
  const ctx = makeCtx('standard');

  it('offers the exact segment for a shell ask', () => {
    expect(alwaysRuleFor(ctx, sh('cargo add serde'), ask)).toEqual({
      offered: true,
      rule: { action: 'shell', resource: 'cargo add serde' },
    });
  });

  it('offers the sensitive folder for a path ask', () => {
    expect(
      alwaysRuleFor(makeCtx('full'), edit('prisma/migrations/2026/a.sql'), ask),
    ).toEqual({
      offered: true,
      rule: { action: 'edit', resource: 'prisma/migrations/**' },
    });
  });

  it('does not offer a protected path, a banned command, a chain or a non-rule ask', () => {
    expect(alwaysRuleFor(ctx, edit('CLAUDE.md'), ask).offered).toBe(false);
    expect(alwaysRuleFor(ctx, sh('bash -c "echo hi"'), ask).offered).toBe(false);
    expect(alwaysRuleFor(ctx, sh('cargo add a && cargo add b'), ask).offered).toBe(false);
    expect(
      alwaysRuleFor(ctx, sh('cargo add serde'), {
        decision: 'ask',
        reason: 'inspector_raised',
      }),
    ).toMatchObject({ offered: false });

    expect(alwaysRuleFor(makeCtx('express'), sh('cargo add serde'), ask).offered).toBe(
      false,
    );
  });
});
