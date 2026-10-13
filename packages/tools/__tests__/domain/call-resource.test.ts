/**
 * Pins callResource(): the one resolver that names what a tool call touched.
 *
 * Why: receipts record a `resource` so the G1 gate can match a Worker's claim ("I edited
 * src/a.ts", "I ran the tests") against what policy actually saw. If the hook computed it
 * with its own logic, the receipt could name a different file than the one `admit()`
 * judged. The resolver shares its path and shell handling with `admit()`; these cases pin
 * the four forms (path, shell text, network host, MCP tool id) and that anything unclear
 * is `null` rather than a guess.
 *
 * Pins: callResource() for path, shell, network, MCP and unresolvable calls.
 * Depends on: domain/call-resource, helpers/fixtures, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { callResource } from '#/domain/call-resource.js';
import { call, makeCtx } from '#tests/helpers/fixtures.js';

const ctx = makeCtx('standard', { cwd: '/work/repo' });

describe('callResource', () => {
  it('path tools: the normalised path, relative to cwd when inside it', () => {
    expect(callResource(ctx, call('edit', { file_path: 'SRC/./a/../A.ts' }))).toBe(
      'src/a.ts',
    );
    expect(callResource(ctx, call('read', { path: '/work/repo/docs/x.md' }))).toBe(
      'docs/x.md',
    );
    expect(callResource(ctx, call('read', { path: '/etc/passwd' }))).toBe('/etc/passwd');
  });

  it('path tools: null when the input names no usable path', () => {
    expect(callResource(ctx, call('read', {}))).toBeNull();
    expect(callResource(ctx, call('read', { path: 7 }))).toBeNull();
  });

  it('shell: the normalised segment text, segments joined by " ; "', () => {
    const c = call('shell', { command: 'pnpm   test && git status' }, { native: 'Bash' });
    expect(callResource(ctx, c)).toBe('pnpm test ; git status');
  });

  it('shell: cut to the first 200 characters', () => {
    const c = call('shell', { command: `echo ${'x'.repeat(500)}` }, { native: 'Bash' });
    const r = callResource(ctx, c);
    expect(r).toHaveLength(200);
    expect(r?.startsWith('echo xxx')).toBe(true);
  });

  it('shell: null when the command cannot be tokenised or is not a string', () => {
    expect(callResource(ctx, call('shell', { command: 'echo $(' }))).toBeNull();
    expect(callResource(ctx, call('shell', { command: 5 }))).toBeNull();
  });

  it('network tools: the host (with a non-default port)', () => {
    expect(
      callResource(
        ctx,
        call('mcp__forge__web_fetch', { url: 'https://Docs.Example.com/a?b=1' }),
      ),
    ).toBe('docs.example.com');
    expect(
      callResource(ctx, call('mcp__forge__web_fetch', { url: 'http://x.test:8080/p' })),
    ).toBe('x.test:8080');
  });

  it('network tools: an unparseable url falls back to the MCP tool id', () => {
    expect(callResource(ctx, call('mcp__forge__web_fetch', { url: 'not a url' }))).toBe(
      'mcp__forge__web_fetch',
    );
  });

  it('MCP tools without a url: the tool id; project MCP always the tool id', () => {
    expect(callResource(ctx, call('mcp__forge__get_ticket', {}))).toBe(
      'mcp__forge__get_ticket',
    );
    expect(
      callResource(
        ctx,
        call('mcp__github__create_issue', { url: 'https://github.com/x' }),
      ),
    ).toBe('mcp__github__create_issue');
  });

  it('is null for an unknown tool or an unverified catalogue', () => {
    expect(callResource(ctx, call('nope', {}))).toBeNull();
    const quarantined = { ...ctx, catalogue: { status: 'quarantined' } } as never;
    expect(callResource(quarantined, call('read', { path: 'a' }))).toBeNull();
  });
});
