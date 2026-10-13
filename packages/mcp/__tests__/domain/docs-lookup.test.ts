/**
 * Pins docs_lookup through the MCP protocol.
 *
 * Why: docs_lookup lets a Worker read project documentation. It must stay inside the
 *   configured docs directories, refuse traversal, absolute paths and symlink escapes,
 *   cap what it returns, and survive hostile globs, or a Worker could read secrets or
 *   hang the server.
 *
 * Pins: docs_lookup.
 * Depends on: helpers/harness, helpers/auto-close, domain/server.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useAutoClose } from '#tests/helpers/auto-close.js';
import { connect, textOf } from '#tests/helpers/harness.js';

const closer = useAutoClose();

describe('docs_lookup', () => {
  const root = mkdtempSync(join(tmpdir(), 'forge-docs-'));
  const docs = join(root, 'docs');
  const outside = join(root, 'secret.md');
  beforeAll(() => {
    mkdirSync(join(docs, 'design'), { recursive: true });
    writeFileSync(join(docs, 'design', 'a.md'), '# A\nhello');
    writeFileSync(join(docs, 'design', 'big.md'), 'x'.repeat(5_000));
    writeFileSync(join(docs, 'design', 'notes.txt'), 'not markdown');
    writeFileSync(outside, 'TOP SECRET');
    try {
      symlinkSync(outside, join(docs, 'link.md'));
    } catch {
      // symlinks may need privileges on Windows; the escape test then relies on `..`.
    }
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reads a markdown file by relative path', async () => {
    const c = await connect({ docsDirs: [docs] });
    closer.set(c.close);
    const res = await c.client.callTool({
      name: 'docs_lookup',
      arguments: { path: 'design/a.md' },
    });

    expect(textOf(res)).toContain('hello');
  });

  it('lists files for a glob', async () => {
    const c = await connect({ docsDirs: [docs] });
    closer.set(c.close);
    const res = await c.client.callTool({
      name: 'docs_lookup',
      arguments: { path: 'design/*.md' },
    });

    const text = textOf(res);
    expect(text).toContain('design/a.md');
    expect(text).toContain('design/big.md');
    expect(text).not.toContain('notes.txt');
  });

  it('truncates at the size cap and says so', async () => {
    const c = await connect({ docsDirs: [docs], docsMaxBytes: 1_000 });
    closer.set(c.close);
    const res = await c.client.callTool({
      name: 'docs_lookup',
      arguments: { path: 'design/big.md', max_bytes: 5_000 },
    });

    const text = textOf(res);
    expect(text).toMatch(/truncated/i);
    expect(text.length).toBeLessThan(1_300);
  });

  it('refuses traversal, absolute paths, symlink escapes and non-markdown', async () => {
    const c = await connect({ docsDirs: [docs] });
    closer.set(c.close);
    for (const path of [
      '../secret.md',
      outside,
      'link.md',
      'design/notes.txt',
      'nope.md',
    ]) {
      const res = await c.client.callTool({ name: 'docs_lookup', arguments: { path } });
      expect(res.isError, path).toBe(true);
      expect(textOf(res)).not.toContain('TOP SECRET');
    }
  });

  it('rejects patterns with more than 8 wildcards', async () => {
    const c = await connect({ docsDirs: [docs] });
    closer.set(c.close);
    const res = await c.client.callTool({
      name: 'docs_lookup',
      arguments: { path: '*a*a*a*a*a*a*a*a*a*.md' },
    });

    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/wildcard/i);
  });

  it('survives a hostile glob in under a second and collapses star runs', async () => {
    const c = await connect({ docsDirs: [docs] });
    closer.set(c.close);
    const started = Date.now();
    const hostile = await c.client.callTool({
      name: 'docs_lookup',
      arguments: { path: `${'**/'.repeat(30)}${'*'.repeat(200)}x.md` },
    });

    expect(Date.now() - started).toBeLessThan(1_000);
    expect(hostile.isError).toBe(true);
    const ok = await c.client.callTool({
      name: 'docs_lookup',
      arguments: { path: 'design/*****.md' },
    });

    expect(textOf(ok)).toContain('design/a.md');
  });

  it('errors when no docs directory is configured', async () => {
    const c = await connect();
    closer.set(c.close);
    const res = await c.client.callTool({
      name: 'docs_lookup',
      arguments: { path: 'a.md' },
    });

    expect(res.isError).toBe(true);
  });
});
