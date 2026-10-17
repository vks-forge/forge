/**
 * Pins the agent layer of a run's grant: it narrows, never widens.
 *
 * Why: an agent says which tools it may use and which paths it may write. That is a promise to
 *   the owner ("the test writer only touches tests, the reviewer cannot edit"), and it is kept
 *   by `admit()`, not by the model's good manners. The layer must be able to refuse more than
 *   the lane and project already do, must never make anything allowed that they would not
 *   (a wide agent scope does not unlock a protected path), and must fail closed when its
 *   scope is empty. The run must still be able to finish, so the Forge tools a run cannot
 *   end without stay visible whatever the agent lists.
 *
 * Pins: lane-default tools with the whole scope add no layer; a tool list hides the rest;
 *   a write scope denies edits outside it; protected paths stay protected; an empty scope
 *   denies all writes; and a property test that no call is allowed with an agent layer that is
 *   not allowed without it.
 * Depends on: domain/agent-grant, domain/admit, domain/grants, helpers/fixtures, fast-check, vitest. No IO.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { admit } from '#/domain/admit.js';
import { agentGrant, RUN_CORE_TOOLS } from '#/domain/agent-grant.js';
import { effectiveGrant } from '#/domain/grants.js';
import type { Decision } from '#/schemas/decision.js';
import { FLOORS, call, makeCtx } from '#tests/helpers/fixtures.js';

type Lane = 'express' | 'standard' | 'full';
type Def = Parameters<typeof agentGrant>[0];

const ctxFor = (lane: Lane, def: Def | undefined) =>
  makeCtx(lane, {
    grant: effectiveGrant(
      lane,
      undefined,
      undefined,
      [],
      FLOORS,
      undefined,
      def ? agentGrant(def) : undefined,
    ),
  });

const decide = (lane: Lane, def: Def | undefined, c: ReturnType<typeof call>): Decision =>
  admit(ctxFor(lane, def), c);

describe('agentGrant', () => {
  it('adds no layer for lane-default tools and the whole worktree', () => {
    expect(agentGrant({ tools: 'lane_default', write_scope: ['**'] })).toBeUndefined();
  });

  it('keeps the Forge tools a run needs to finish whatever tools the agent lists', () => {
    const g = agentGrant({ tools: ['read'], write_scope: [] });

    expect(g?.allow).toEqual(expect.arrayContaining(['read', ...RUN_CORE_TOOLS]));
    expect(RUN_CORE_TOOLS).toContain('mcp__forge__finish');
  });
});

describe('agent tools', () => {
  const def: Def = { tools: ['read', 'edit'], write_scope: ['**'] };

  it('denies a shell call when the agent lists only read and edit', () => {
    const d = decide(
      'standard',
      def,
      call('shell', { command: 'pnpm test' }, { native: 'PowerShell' }),
    );

    expect(d.decision).toBe('deny');
    expect(d.reason).toBe('not_granted');
  });

  it('still allows the listed tools and the finish tool', () => {
    expect(decide('standard', def, call('read', { path: 'src/a.ts' })).decision).toBe(
      'allow',
    );

    expect(decide('standard', def, call('edit', { path: 'src/a.ts' })).decision).toBe(
      'allow',
    );

    expect(decide('standard', def, call('mcp__forge__finish', {})).decision).toBe(
      'allow',
    );
  });

  it('hides a tool the lane allows but the agent does not list', () => {
    expect(
      decide('express', def, call('grep', { pattern: 'x', path: 'src' })).decision,
    ).toBe('deny');
  });

  it('cannot grant a tool the lane never offers', () => {
    const wide: Def = { tools: ['mcp__forge__web_search', 'read'], write_scope: ['**'] };

    expect(
      decide('express', wide, call('mcp__forge__web_search', { query: 'x' })).decision,
    ).toBe('deny');
  });
});

describe('agent write scope', () => {
  const def: Def = { tools: 'lane_default', write_scope: ['src/**'] };

  it('allows an edit inside the scope and denies one outside it', () => {
    expect(decide('standard', def, call('edit', { path: 'src/a.ts' })).decision).toBe(
      'allow',
    );

    const outside = decide('standard', def, call('edit', { path: 'docs/x.md' }));

    expect(outside.decision).toBe('deny');
    expect(outside.reason).toBe('rule_deny');
  });

  it('applies to write as well as edit and leaves reads alone', () => {
    expect(decide('standard', def, call('write', { path: 'docs/x.md' })).decision).toBe(
      'deny',
    );

    expect(decide('standard', def, call('read', { path: 'docs/x.md' })).decision).toBe(
      'allow',
    );
  });

  it('keeps a protected path protected even when the scope names it', () => {
    const wide: Def = { tools: 'lane_default', write_scope: ['**'] };
    const named: Def = { tools: 'lane_default', write_scope: ['migrations/**'] };
    const c = call('edit', { path: 'migrations/0003.sql' });

    expect(decide('express', wide, c).decision).toBe('deny');
    expect(decide('express', named, c).decision).toBe('deny');
  });

  it('denies every write for an empty scope (fail closed) and still allows reads', () => {
    const none: Def = { tools: 'lane_default', write_scope: [] };

    expect(decide('standard', none, call('edit', { path: 'src/a.ts' })).decision).toBe(
      'deny',
    );

    expect(decide('standard', none, call('read', { path: 'src/a.ts' })).decision).toBe(
      'allow',
    );
  });

  it('treats a path that climbs out of the worktree as outside the scope', () => {
    expect(
      decide('standard', def, call('edit', { path: 'src/../docs/x.md' })).decision,
    ).toBe('deny');
  });
});

describe('the agent layer only narrows (property)', () => {
  const TOOL_IDS = [
    'read',
    'grep',
    'glob',
    'edit',
    'write',
    'shell',
    'mcp__forge__finish',
    'mcp__forge__web_search',
    'mcp__github__create_issue',
  ];

  const PATHS = [
    'src/a.ts',
    'docs/x.md',
    'migrations/1.sql',
    'src/../docs/x.md',
    '.forge/memory/m.md',
    '../outside.txt',
  ];

  const SCOPES = [
    '**',
    'src/**',
    'docs/**',
    '**/*.test.ts',
    'migrations/**',
    '.forge/**',
  ];

  const defArb: fc.Arbitrary<Def> = fc.record({
    tools: fc.oneof(fc.constant('lane_default' as const), fc.subarray(TOOL_IDS)),
    write_scope: fc.subarray(SCOPES),
  });

  const callArb = fc.oneof(
    fc
      .record({
        tool: fc.constantFrom('read', 'edit', 'write', 'grep'),
        path: fc.constantFrom(...PATHS),
      })
      .map((r) => call(r.tool, { path: r.path, pattern: 'x' })),
    fc
      .constantFrom('pnpm test', 'git status', 'echo hi', 'pnpm add zod')
      .map((command) => call('shell', { command }, { native: 'PowerShell' })),
    fc
      .constantFrom(
        'mcp__forge__finish',
        'mcp__forge__web_search',
        'mcp__github__create_issue',
      )
      .map((t) => call(t, { query: 'x' })),
  );

  it('never allows a call that the same run without the agent layer would not allow', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Lane>('express', 'standard', 'full'),
        defArb,
        callArb,
        (lane, def, c) => {
          const without = decide(lane, undefined, c);
          const withAgent = decide(lane, def, c);

          if (withAgent.decision === 'allow') {
            expect(without.decision).toBe('allow');
          }

          if (without.decision === 'deny') {
            expect(withAgent.decision).toBe('deny');
          }
        },
      ),
      { numRuns: 400 },
    );
  });
});
