/**
 * Pins admit() against the lane defaults table: Express, Standard and Full.
 *
 * Why: this decides whether a Worker's `git push`, web search or migration edit happens.
 * Express denies what Standard asks and never waits for a human (nobody is watching);
 * Standard and Full route asks to a person. The table in tool-system.md section 12 is
 * walked row by row so a lane default cannot drift unnoticed.
 *
 * Pins: admit() verdicts per lane, unattended ask-to-deny, project grants and rules.
 * Depends on: domain/admit, helpers/fixtures, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { admit } from '#/domain/admit.js';
import type { Decision } from '#/schemas/decision.js';
import { call, grant, makeCtx, withEntry } from '#tests/helpers/fixtures.js';

const sh = (command: string, native = 'PowerShell') =>
  call('shell', { command }, { native });

const verdict = (d: Decision) => [d.decision, d.reason];

describe('Express defaults (unattended: ask becomes deny)', () => {
  const ctx = makeCtx('express');

  it.each([
    [call('read', { path: 'src/a.ts' }), 'allow', 'rule_allow'],
    [call('edit', { path: 'src/a.ts' }), 'allow', 'rule_allow'],
    [call('edit', { path: 'migrations/0003.sql' }), 'deny', 'rule_deny'],
    [call('edit', { path: '.forge/memory/x.md' }), 'deny', 'rule_deny'],
    [sh('pnpm test'), 'allow', 'rule_allow'],
    [sh('git commit -m "x"'), 'allow', 'rule_allow'],
    [sh('git push origin main'), 'deny', 'managed_deny'],
    [sh('pnpm add zod'), 'deny', 'rule_deny'],
    [call('mcp__forge__get_ticket', {}), 'allow', 'rule_allow'],
    [call('mcp__forge__finish', {}), 'allow', 'rule_allow'],
    [call('mcp__forge__docs_lookup', { query: 'zod' }), 'allow', 'rule_allow'],
    [call('mcp__forge__web_search', { query: 'x' }), 'deny', 'not_granted'],
    [call('mcp__forge__web_fetch', { url: 'https://docs.x.com' }), 'deny', 'not_granted'],
    [call('mcp__forge__db_query_readonly', {}), 'deny', 'not_granted'],
    [call('mcp__forge__memory_search', {}), 'deny', 'not_granted'],
    [call('mcp__github__create_issue', {}), 'deny', 'not_granted'],
  ])('%j -> %s %s', (c, decision, reason) => {
    expect(verdict(admit(ctx, c))).toEqual([decision, reason]);
  });

  it('turns an ask into a deny with reason unattended', () => {
    const d = admit(ctx, sh('echo hello'));
    expect(verdict(d)).toEqual(['deny', 'unattended']);
    expect(d.layer).toBe('approval');
  });

  it('stays unattended even if the context claims a human is available', () => {
    const d = admit(makeCtx('express', { unattended: false }), sh('echo hello'));
    expect(verdict(d)).toEqual(['deny', 'unattended']);
  });

  it('denies a shell chain whose second command is a push', () => {
    expect(verdict(admit(ctx, sh('pnpm test && git push')))).toEqual([
      'deny',
      'managed_deny',
    ]);
  });
});

describe('Standard defaults (asks go to a human)', () => {
  const ctx = makeCtx('standard');

  it.each([
    [call('mcp__forge__web_search', { query: 'x' }), 'allow', 'rule_allow'],
    [
      call('mcp__forge__web_fetch', { url: 'https://docs.example.com/a' }),
      'allow',
      'rule_allow',
    ],
    [call('mcp__forge__web_fetch', { url: 'https://example.com/a' }), 'ask', 'rule_ask'],
    [call('edit', { path: 'migrations/0003.sql' }), 'ask', 'rule_ask'],
    [call('write', { path: 'auth/login.ts' }), 'ask', 'rule_ask'],
    [call('edit', { path: '.claude/settings.json' }), 'ask', 'rule_ask'],
    [sh('pnpm add zod'), 'ask', 'rule_ask'],
    [sh('echo hello'), 'ask', 'no_matching_rule'],
    [sh('git push'), 'deny', 'managed_deny'],
    [call('mcp__forge__db_query_readonly', {}), 'deny', 'not_granted'],
    [call('mcp__github__create_issue', {}), 'deny', 'not_granted'],
  ])('%j -> %s %s', (c, decision, reason) => {
    expect(verdict(admit(ctx, c))).toEqual([decision, reason]);
  });

  it('turns an ask into a deny when told nobody can answer', () => {
    const d = admit(makeCtx('standard', { unattended: true }), sh('pnpm add zod'));
    expect(verdict(d)).toEqual(['deny', 'unattended']);
  });

  it('allows project-gated tools only with a project grant', () => {
    const project = grant({
      allow: ['mcp__forge__db_query_readonly', 'mcp__github__*', 'read'],
    });

    const c = makeCtx('standard', {}, { project });
    expect(verdict(admit(c, call('mcp__forge__db_query_readonly', {})))).toEqual([
      'allow',
      'rule_allow',
    ]);

    expect(verdict(admit(c, call('mcp__github__create_issue', {})))).toEqual([
      'allow',
      'rule_allow',
    ]);

    expect(verdict(admit(c, sh('pnpm test')))).toEqual(['deny', 'not_granted']);
  });

  it('applies a project rule that tightens a project MCP', () => {
    const project = grant({
      allow: ['mcp__github__*'],
      rules: [
        { action: 'project_mcp', resource: 'mcp__github__create_*', effect: 'ask' },
      ],
    });

    const d = admit(
      makeCtx('standard', {}, { project }),
      call('mcp__github__create_issue', {}),
    );

    expect(verdict(d)).toEqual(['ask', 'rule_ask']);
    expect(d.matched_rule).toBe('project#0');
  });
});

describe('Full defaults', () => {
  const ctx = makeCtx('full');

  it.each([
    [call('mcp__forge__web_search', { query: 'x' }), 'allow', 'rule_allow'],
    [
      call('mcp__forge__web_fetch', { url: 'https://docs.example.com/a' }),
      'ask',
      'rule_ask',
    ],
    [sh('pnpm add zod'), 'ask', 'rule_ask'],
    [call('edit', { path: 'auth/login.ts' }), 'ask', 'rule_ask'],
    [sh('pnpm test'), 'allow', 'rule_allow'],
  ])('%j -> %s %s', (c, decision, reason) => {
    expect(verdict(admit(ctx, c))).toEqual([decision, reason]);
  });

  it('refuses network tools whose harness enforcement is not os or server', () => {
    const entries = withEntry('mcp__forge__web_search', {
      support: { '*': { mechanism: 'hook', enforced: 'hook' } },
    });

    const full = makeCtx('full', {}, {}, entries);
    const std = makeCtx('standard', {}, {}, entries);
    const c = call('mcp__forge__web_search', { query: 'x' });
    expect(verdict(admit(full, c))).toEqual(['deny', 'enforcement_insufficient']);
    expect(admit(std, c).decision).toBe('allow');
  });
});
