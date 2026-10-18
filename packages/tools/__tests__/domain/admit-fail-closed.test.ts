/**
 * Pins admit() fail-closed behaviour, exposure rules, inspectors, budgets and list/call agreement.
 *
 * Why: a quarantined catalogue, a changed schema, an unsupported harness, a hidden or
 * unreachable tool, a throwing inspector or a budget breach must each end in a denial
 * with a stable reason, never an accidental allow. Listing and calling must agree, so a
 * model is never shown a tool a call would refuse for reasons known up front.
 *
 * Pins: admit(), visibleTools(), reasons and receipt-facing decision fields.
 * Depends on: domain/admit, helpers/fixtures, schemas/decision, fast-check, vitest. No IO.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { admit, visibleTools } from '#/domain/admit.js';
import { loadCatalogue } from '#/domain/catalogue.js';
import { Decision } from '#/schemas/decision.js';
import {
  ENTRIES,
  call,
  grant,
  makeCtx,
  catalogueDoc,
  withEntry,
} from '#tests/helpers/fixtures.js';

const sh = (command: string, native = 'PowerShell') =>
  call('shell', { command }, { native });

const verdict = (d: Decision) => [d.decision, d.reason];

describe('fail closed', () => {
  it('denies everything when the catalogue is quarantined', () => {
    const quarantined = loadCatalogue({ entries: [] });
    const ctx = makeCtx('full', { catalogue: quarantined });
    expect(verdict(admit(ctx, call('read', { path: 'a' })))).toEqual([
      'deny',
      'quarantined',
    ]);

    expect(visibleTools(ctx)).toEqual([]);
  });

  it('denies an unknown tool with the same shape as a filtered one', () => {
    const ctx = makeCtx('full');
    const unknown = admit(ctx, call('does_not_exist', {}));
    expect(verdict(unknown)).toEqual(['deny', 'unknown_tool']);
    expect(unknown.enforced_by).toBe('forge_admit');
  });

  it('denies with schema_changed when the live schema hash differs or is missing', () => {
    const changed = makeCtx('full', {
      liveSchemaHashes: {
        ...makeCtx('full').liveSchemaHashes,
        shell: `sha256:${'a'.repeat(64)}`,
      },
    });

    expect(verdict(admit(changed, sh('pnpm test')))).toEqual(['deny', 'schema_changed']);
    expect(admit(changed, call('read', { path: 'a' })).decision).toBe('allow');
    const missing = makeCtx('full', { liveSchemaHashes: {} });
    expect(verdict(admit(missing, call('read', { path: 'a' })))).toEqual([
      'deny',
      'schema_changed',
    ]);

    expect(visibleTools(missing)).toEqual([]);
  });

  it('denies a tool the harness has no support entry for', () => {
    const ctx = makeCtx('full', { harness: 'codex' });
    expect(verdict(admit(ctx, call('read', { path: 'a' })))).toEqual([
      'deny',
      'unsupported_harness',
    ]);

    expect(admit(ctx, call('mcp__forge__finish', {})).decision).toBe('allow');
  });

  it('never throws: a malformed context becomes inspector_error', () => {
    const broken = { ...makeCtx('full'), grant: null } as unknown as Parameters<
      typeof admit
    >[0];

    expect(verdict(admit(broken, call('read', { path: 'a' })))).toEqual([
      'deny',
      'inspector_error',
    ]);
  });

  it.each([
    ['dynamic execution via iex', sh('iex $x'), 'dynamic_execution'],
    ['PowerShell call operator', sh('& "C:\\x.exe"'), 'dynamic_execution'],
    ['unbalanced quote', sh('echo "oops'), 'untokenizable'],
    ['heredoc', sh('cat <<EOF', 'Bash'), 'untokenizable'],
    ['missing command', call('shell', {}), 'untokenizable'],
    ['non-string command', call('shell', { command: 7 }), 'untokenizable'],
  ])('shell: %s -> deny %s', (_n, c, reason) => {
    expect(verdict(admit(makeCtx('full'), c))).toEqual(['deny', reason]);
  });

  it('uses the bash tokenizer unless the native tool is PowerShell', () => {
    expect(admit(makeCtx('full'), sh('pnpm test', 'Bash')).decision).toBe('allow');
    expect(admit(makeCtx('full'), sh('get-childitem .', 'pwsh')).decision).toBe('allow');
    expect(admit(makeCtx('full'), sh('get-childitem .', 'Bash')).decision).toBe('ask');
  });
});

describe('exposure, nesting and code mode', () => {
  const hidden = makeCtx('full', {}, {}, withEntry('edit', { exposure: 'hidden' }));
  const codemode = makeCtx('full', {}, {}, withEntry('read', { exposure: 'codemode' }));

  it('never exposes or runs hidden tools', () => {
    expect(verdict(admit(hidden, call('edit', { path: 'a' })))).toEqual([
      'deny',
      'exposure',
    ]);

    expect(visibleTools(hidden).map((t) => t.id)).not.toContain('edit');
  });

  it('allows a codemode tool only from inside a code-mode script', () => {
    const direct = call('read', { path: 'a' });
    const viaScript = call(
      'read',
      { path: 'a' },
      { via: 'codemode', parent_tool: 'mcp__forge__tool_search' },
    );

    expect(verdict(admit(codemode, direct))).toEqual(['deny', 'exposure']);
    expect(admit(codemode, viaScript).decision).toBe('allow');
  });

  it('applies the full policy to nested calls and checks the parent can reach the tool', () => {
    const ctx = makeCtx('full');
    const via = { via: 'nested', parent_tool: 'mcp__forge__tool_search' } as const;
    expect(admit(ctx, call('read', { path: 'a' }, via)).decision).toBe('allow');
    expect(verdict(admit(ctx, call('edit', { path: 'a' }, via)))).toEqual([
      'deny',
      'not_reachable',
    ]);

    expect(verdict(admit(ctx, call('read', { path: '.env' }, via)))).toEqual([
      'deny',
      'managed_deny',
    ]);

    expect(verdict(admit(ctx, call('read', { path: 'a' }, { via: 'nested' })))).toEqual([
      'deny',
      'not_reachable',
    ]);

    expect(
      verdict(
        admit(ctx, call('read', { path: 'a' }, { via: 'nested', parent_tool: 'ghost' })),
      ),
    ).toEqual(['deny', 'not_reachable']);
  });

  it('judges the real tool behind a wrapper by its own rules', () => {
    const ctx = makeCtx('standard');
    const d = admit(
      ctx,
      call(
        'shell',
        { command: 'git push' },
        { via: 'nested', parent_tool: 'mcp__forge__tool_search' },
      ),
    );

    expect(d.decision).toBe('deny');
  });
});

describe('decision shape', () => {
  it('always validates against the Decision schema and reports enforcement honestly', () => {
    const ctx = makeCtx('standard');
    for (const c of [call('read', { path: 'a' }), sh('git push'), call('nope', {})]) {
      expect(Decision.safeParse(admit(ctx, c)).success).toBe(true);
    }

    expect(admit(ctx, call('read', { path: 'a' })).enforcement).toBe('harness');
    expect(admit(ctx, call('mcp__forge__web_search', { query: 'q' })).enforcement).toBe(
      'server',
    );

    expect(admit(ctx, call('nope', {})).enforcement).toBeNull();
  });

  it('records which rule decided', () => {
    const d = admit(makeCtx('standard'), sh('git push'));
    expect(d.matched_rule).toMatch(/^(managed#\d+|floor:argv:.+)$/);
    expect(d.layer).toBe('floor');
    const g = admit(makeCtx('express'), call('mcp__forge__web_search', { query: 'q' }));
    expect(g.matched_rule).toBe('grant:ceiling');
  });
});

describe('list and call agree', () => {
  it('lists per lane exactly the granted, exposed, supported tools', () => {
    const ids = (lane: 'express' | 'standard' | 'full') =>
      visibleTools(makeCtx(lane)).map((t) => t.id);

    expect(ids('express')).not.toContain('mcp__forge__web_search');
    expect(ids('standard')).toContain('mcp__forge__web_search');
    expect(ids('full')).toContain('shell');
    expect(ids('express')).not.toContain('mcp__forge__memory_search');
    expect(ids('standard')).toContain('mcp__forge__memory_search');
    for (const lane of ['express', 'standard', 'full'] as const) {
      expect(ids(lane)).not.toContain('mcp__github__create_issue');
    }
  });

  // 30s: 100 generated runs of the full policy are CPU-bound and starve under the parallel full suite.
  it('a tool the list refuses is never allowed by a call', { timeout: 30_000 }, () => {
    const toolIds = ENTRIES.map((e) => e.id as string);
    fc.assert(
      fc.property(
        fc.constantFrom('express', 'standard', 'full'),
        fc.constantFrom(...toolIds),
        fc.subarray(toolIds),
        (lane, tool, denied) => {
          const ctx = makeCtx(lane, {}, { project: grant({ deny: denied }) });
          const listed = admit(ctx, { phase: 'list', tool }).decision === 'allow';
          const called = admit(
            ctx,
            call(tool, { path: 'src/a.ts', command: 'pnpm test', query: 'q' }),
          );

          if (!listed) {
            expect(called.decision).not.toBe('allow');
          }
        },
      ),
    );
  });

  it('loads with the production loader (fixture sanity)', () => {
    expect(loadCatalogue(catalogueDoc()).status).toBe('verified');
  });
});

describe('lane comes from the grant alone', () => {
  const ask = sh('echo hi', 'Bash');

  it('is unattended on Express whatever the context claims', () => {
    const ctx = { ...makeCtx('express'), lane: 'standard' as const };
    expect(admit(ctx, ask).decision).toBe('deny');
  });

  it('a context lane that disagrees with the grant lane is refused', () => {
    const ctx = { ...makeCtx('standard'), lane: 'express' as const };
    const d = admit(ctx, call('read', { path: 'src/a.ts' }));
    expect(d.decision).toBe('deny');
  });

  it('`unattended: false` cannot make Express wait for a human', () => {
    const ctx = makeCtx('express', { unattended: false });
    expect(admit(ctx, ask)).toMatchObject({ decision: 'deny', reason: 'unattended' });
  });

  it('`unattended: true` can only tighten Standard', () => {
    expect(admit(makeCtx('standard'), ask).decision).toBe('ask');
    expect(admit(makeCtx('standard', { unattended: true }), ask).decision).toBe('deny');
  });

  it('enforces the Full-lane network enforcement floor from the grant lane', () => {
    const entries = withEntry('mcp__forge__web_fetch', {
      support: { '*': { mechanism: 'mcp', enforced: 'hook' } },
    });

    const ctx = {
      ...makeCtx('full', {}, {}, entries),
      lane: 'standard' as const,
    };

    expect(
      admit(ctx, call('mcp__forge__web_fetch', { url: 'https://docs.x.com' })),
    ).toMatchObject({
      decision: 'deny',
    });
  });
});
