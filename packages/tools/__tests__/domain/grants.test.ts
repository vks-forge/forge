/**
 * Pins grant building: lane ceilings, narrowing-only layers, deny wins, banned always-allow.
 *
 * Why: the set of tools a Worker can see is a security boundary built from several files
 * written by different people. These tests fix that a project or ticket grant can only
 * shrink what the lane offers (except naming the project-gated tools the lane reserves
 * for projects), that any deny beats any allow, and that rules which would make an
 * interpreter permanently allowed are refused before the run starts.
 *
 * Pins: effectiveGrant(), checkToolGranted(), assertNotBannedAlwaysAllow(), parseGrant().
 * Depends on: domain/grants, domain/lane-defaults, helpers/fixtures, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import {
  assertNotBannedAlwaysAllow,
  checkToolGranted,
  effectiveGrant,
  parseGrant,
} from '#/domain/grants.js';
import { BannedAlwaysAllowError, InvalidGrantError } from '#/shared/errors.js';
import { ENTRIES, grant } from '#tests/helpers/fixtures.js';

const IDS = ENTRIES.map((e) => e.id as string);
const granted = (g: ReturnType<typeof effectiveGrant>, id: string) =>
  checkToolGranted(g, id).granted;

describe('lane ceilings (tool-system.md section 12)', () => {
  it.each([
    ['express', 'mcp__forge__web_search', false],
    ['express', 'mcp__forge__web_fetch', false],
    ['express', 'mcp__forge__docs_lookup', true],
    ['express', 'shell', true],
    ['standard', 'mcp__forge__web_search', true],
    ['standard', 'mcp__forge__web_fetch', true],
    ['full', 'mcp__forge__web_search', true],
    ['standard', 'mcp__forge__db_query_readonly', false],
    ['standard', 'mcp__github__create_issue', false],
    ['full', 'mcp__forge__memory_search', false],
    ['standard', 'mcp__forge__memory_search', false],
    ['express', 'mcp__forge__memory_search', false],
    ['standard', 'unknown_tool_x', false],
  ] as const)('%s lane / %s granted=%s', (lane, id, expected) => {
    expect(granted(effectiveGrant(lane), id)).toBe(expected);
  });
});

describe('narrowing layers', () => {
  it('a project allow list restricts the lane ceiling', () => {
    const g = effectiveGrant('standard', grant({ allow: ['read', 'shell'] }));
    expect(IDS.filter((id) => granted(g, id))).toEqual(['read', 'shell']);
  });

  it('a project allow list cannot add a tool the lane excludes', () => {
    const g = effectiveGrant(
      'express',
      grant({ allow: ['mcp__forge__web_search', 'read'] }),
    );

    expect(granted(g, 'mcp__forge__web_search')).toBe(false);
    expect(granted(g, 'read')).toBe(true);
  });

  it('a ticket allow list intersects with the project allow list', () => {
    const g = effectiveGrant(
      'standard',
      grant({ allow: ['read', 'grep', 'shell'] }),
      grant({ allow: ['grep', 'shell', 'edit'] }),
    );

    expect(IDS.filter((id) => granted(g, id))).toEqual(['grep', 'shell']);
  });

  it('deny wins over allow in any layer, with provenance', () => {
    const g = effectiveGrant(
      'standard',
      grant({ allow: ['shell'] }),
      grant({ deny: ['shell'] }),
    );

    expect(checkToolGranted(g, 'shell')).toEqual({
      granted: false,
      rule: 'grant:deny:shell',
    });

    const h = effectiveGrant('standard', grant({ deny: ['mcp__forge__*'] }));
    expect(granted(h, 'mcp__forge__finish')).toBe(false);
    expect(granted(h, 'read')).toBe(true);
  });

  it('reports which layer refused', () => {
    const g = effectiveGrant('standard', grant({ allow: ['read'] }));
    expect(checkToolGranted(g, 'shell').rule).toBe('grant:narrow:0');
    expect(
      checkToolGranted(effectiveGrant('express'), 'mcp__forge__web_search').rule,
    ).toBe('grant:ceiling');
  });
});

describe('project-gated tools', () => {
  it('db_query_readonly needs the project to name it, in standard and full only', () => {
    const named = grant({ allow: ['mcp__forge__db_query_readonly', 'read'] });
    expect(
      granted(effectiveGrant('standard', named), 'mcp__forge__db_query_readonly'),
    ).toBe(true);

    expect(granted(effectiveGrant('full', named), 'mcp__forge__db_query_readonly')).toBe(
      true,
    );

    expect(
      granted(effectiveGrant('express', named), 'mcp__forge__db_query_readonly'),
    ).toBe(false);

    expect(
      granted(
        effectiveGrant('standard', grant({ allow: ['*'] })),
        'mcp__forge__db_query_readonly',
      ),
    ).toBe(false);
  });

  it('project MCPs need an explicit project allow and a lane that permits them', () => {
    const named = grant({ allow: ['mcp__github__*'] });
    expect(granted(effectiveGrant('standard', named), 'mcp__github__create_issue')).toBe(
      true,
    );

    expect(granted(effectiveGrant('express', named), 'mcp__github__create_issue')).toBe(
      false,
    );

    expect(
      granted(
        effectiveGrant('standard', grant({ allow: ['*'] })),
        'mcp__github__create_issue',
      ),
    ).toBe(false);

    const narrowed = effectiveGrant('standard', named, grant({ allow: ['read'] }));
    expect(granted(narrowed, 'mcp__github__create_issue')).toBe(false);
    const denied = effectiveGrant(
      'standard',
      named,
      grant({ deny: ['mcp__github__create_issue'] }),
    );

    expect(granted(denied, 'mcp__github__create_issue')).toBe(false);
  });
});

describe('banned always-allow list', () => {
  it.each([
    'bash -c *',
    'bash -c "x"',
    'sh -c*',
    'python -c*',
    'python3 -c *',
    'node -e*',
    'pwsh -Command*',
    'powershell -c *',
    'cmd /c *',
    'git',
    'git *',
    'git*',
    '*',
    '',
    'g*t',
    '*sh -c*',
    'eval *',
    'iex*',
    'Invoke-Expression*',
    'env *',
    'sudo *',
    'xargs*',
    'npx *',
    'pnpm dlx *',
    '. ./x',
    'node',
  ])('rejects shell allow %j', (resource) => {
    expect(() =>
      assertNotBannedAlwaysAllow({ action: 'shell', resource, effect: 'allow' }),
    ).toThrow(BannedAlwaysAllowError);
  });

  it.each(['git status*', 'git diff*', 'pnpm test*', 'ls', 'tsc*', 'Get-ChildItem*'])(
    'accepts narrow allow %j',
    (resource) => {
      expect(() =>
        assertNotBannedAlwaysAllow({ action: 'shell', resource, effect: 'allow' }),
      ).not.toThrow();
    },
  );

  it('only bans allow: ask and deny of a banned prefix are fine, as are other actions', () => {
    for (const effect of ['ask', 'deny'] as const) {
      expect(() =>
        assertNotBannedAlwaysAllow({ action: 'shell', resource: 'bash -c *', effect }),
      ).not.toThrow();
    }

    expect(() =>
      assertNotBannedAlwaysAllow({ action: 'edit', resource: '**', effect: 'allow' }),
    ).not.toThrow();
  });

  it('effectiveGrant rejects a banned rule in the project or ticket layer', () => {
    const bad = grant({
      rules: [{ action: 'shell', resource: 'bash -c *', effect: 'allow' }],
    });

    expect(() => effectiveGrant('standard', bad)).toThrow(BannedAlwaysAllowError);
    expect(() => effectiveGrant('standard', undefined, bad)).toThrow(
      BannedAlwaysAllowError,
    );
  });

  it('the built-in lane defaults contain no banned rule', () => {
    for (const lane of ['express', 'standard', 'full'] as const) {
      expect(() => effectiveGrant(lane)).not.toThrow();
    }
  });

  it('managed rules must be deny-only', () => {
    expect(() =>
      effectiveGrant('standard', undefined, undefined, [
        { action: 'shell', resource: 'ls', effect: 'allow' },
      ]),
    ).toThrow(InvalidGrantError);
  });

  it('parseGrant turns bad input into InvalidGrantError and banned rules into BannedAlwaysAllowError', () => {
    expect(() => parseGrant({ allow: 'read' })).toThrow(InvalidGrantError);
    expect(() =>
      parseGrant({ rules: [{ action: 'shell', resource: 'node -e*', effect: 'allow' }] }),
    ).toThrow(BannedAlwaysAllowError);

    expect(parseGrant({ allow: ['read'] }).deny).toEqual([]);
  });
});
