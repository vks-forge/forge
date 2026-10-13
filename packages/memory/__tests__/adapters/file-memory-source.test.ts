/**
 * File memory source tests — pin which records reach the Director as constraints.
 *
 * Why: the Director must obey active decisions and avoid rejected approaches, and must
 *   never treat superseded, proposed or malformed records as constraints. A slug from a
 *   chat must not be able to read outside the memory root. These tests pin that filter
 *   against temp trees and against the real repo memory so the format cannot drift.
 *
 * Pins: status filter, proposed/outcomes never read, skip reporting, slug safety,
 *   slug-folder vs flat layout, id ordering, real-repo parse of every record.
 * Depends on: adapters/file-memory-source, @forge/core (MemorySource type).
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MemorySource } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileMemorySource } from '#/adapters/file-memory-source.js';

let root: string;
const skips: { path: string; reason: string }[] = [];
const onSkip = (path: string, reason: string): void => {
  skips.push({ path, reason });
};

function rec(
  id: string,
  status: string | null,
  statement = `statement of ${id}`,
): string {
  const st = status === null ? '' : `status: ${status}\n`;
  return `---\nid: ${id}\nstatement: ${statement}\n${st}---\nbody\n`;
}

async function put(dir: string, file: string, text: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, file), text);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-mem-'));
  skips.length = 0;
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('createFileMemorySource', () => {
  it('satisfies the MemorySource port', () => {
    const source: MemorySource = createFileMemorySource(root);
    expect(typeof source.slice).toBe('function');
  });

  it('returns only active decisions, sorted by id', async () => {
    const dir = join(root, 'proj', 'decisions');
    await put(dir, 'd-0002-b.md', rec('d-0002', 'active'));
    await put(dir, 'd-0001-a.md', rec('d-0001', 'active'));
    await put(dir, 'd-0003-c.md', rec('d-0003', 'superseded'));
    await put(join(root, 'proj', 'proposed'), 'x-0001.md', rec('x-0001', 'pending'));
    await put(join(root, 'proj', 'outcomes', '2026-10'), 'o.md', rec('d-0009', 'active'));

    const slice = await createFileMemorySource(root).slice('proj');

    expect(slice.decisions.map((d) => d.id)).toEqual(['d-0001', 'd-0002']);
    expect(slice.decisions[0]?.statement).toBe('statement of d-0001');
    expect(slice.rejected).toEqual([]);
  });

  it('reads rejected records with absent, active or rejected status only', async () => {
    const dir = join(root, 'proj', 'rejected');
    await put(dir, 'r-0001.md', rec('r-0001', null));
    await put(dir, 'r-0002.md', rec('r-0002', 'active'));
    await put(dir, 'r-0003.md', rec('r-0003', 'rejected'));
    await put(dir, 'r-0004.md', rec('r-0004', 'superseded'));

    const slice = await createFileMemorySource(root).slice('proj');

    expect(slice.rejected.map((r) => r.id)).toEqual(['r-0001', 'r-0002', 'r-0003']);
  });

  it('returns an empty slice for an unknown project', async () => {
    const slice = await createFileMemorySource(root, { onSkip }).slice('nope');
    expect(slice).toEqual({ decisions: [], rejected: [] });
    expect(skips).toEqual([]);
  });

  it('handles a project with decisions but no rejected folder', async () => {
    await put(join(root, 'proj', 'decisions'), 'd-0001.md', rec('d-0001', 'active'));
    const slice = await createFileMemorySource(root).slice('proj');
    expect(slice.decisions).toHaveLength(1);
    expect(slice.rejected).toEqual([]);
  });

  it('skips malformed records and reports them without throwing', async () => {
    const dir = join(root, 'proj', 'decisions');
    await put(dir, 'd-0001.md', rec('d-0001', 'active'));
    await put(dir, 'bad-yaml.md', '---\nid: [oops\n---\n');
    await put(dir, 'no-fm.md', 'just text');
    await put(dir, 'bad-id.md', rec('D-1', 'active'));
    await put(
      dir,
      'empty-statement.md',
      '---\nid: d-0005\nstatement: ""\nstatus: active\n---\n',
    );
    await put(dir, 'notes.txt', 'ignored, not markdown');

    const slice = await createFileMemorySource(root, { onSkip }).slice('proj');

    expect(slice.decisions.map((d) => d.id)).toEqual(['d-0001']);
    expect(skips.map((s) => s.path.split(/[\\/]/).pop()).sort()).toEqual([
      'bad-id.md',
      'bad-yaml.md',
      'empty-statement.md',
      'no-fm.md',
    ]);
    expect(skips.every((s) => s.reason.length > 0)).toBe(true);
  });

  it('works without an onSkip callback', async () => {
    await put(join(root, 'proj', 'decisions'), 'bad.md', 'nothing');
    const slice = await createFileMemorySource(root).slice('proj');
    expect(slice.decisions).toEqual([]);
  });

  it('rejects slugs that could escape the root', async () => {
    await put(join(root, 'decisions'), 'd-0001.md', rec('d-0001', 'active'));
    const source = createFileMemorySource(root, { onSkip });
    const bad = ['..', '../x', 'a/b', 'a\\b', '', 'A', '-x', '.', 'x y'];
    for (const slug of bad) {
      expect(await source.slice(slug)).toEqual({ decisions: [], rejected: [] });
    }
    expect(skips).toHaveLength(bad.length);
  });

  it('uses the slug folder when it exists', async () => {
    await put(
      join(root, 'proj', 'decisions'),
      'd-0001.md',
      rec('d-0001', 'active', 'slug'),
    );
    await put(join(root, 'decisions'), 'd-0002.md', rec('d-0002', 'active', 'flat'));
    const slice = await createFileMemorySource(root).slice('proj');
    expect(slice.decisions.map((d) => d.statement)).toEqual(['slug']);
  });

  it('falls back to the flat layout when no slug folder exists', async () => {
    await put(join(root, 'decisions'), 'd-0002.md', rec('d-0002', 'active', 'flat'));
    const slice = await createFileMemorySource(root).slice('forge');
    expect(slice.decisions.map((d) => d.statement)).toEqual(['flat']);
  });
});

describe('createFileMemorySource on the real repo memory', () => {
  const repoMemory = fileURLToPath(new URL('../../../../.forge/memory', import.meta.url));

  it('parses every real record and returns known active, not superseded, ones', async () => {
    const real: { path: string; reason: string }[] = [];
    const slice = await createFileMemorySource(repoMemory, {
      onSkip: (path, reason) => real.push({ path, reason }),
    }).slice('forge');

    const ids = slice.decisions.map((d) => d.id);
    expect(real).toEqual([]);
    expect(ids).toEqual(expect.arrayContaining(['d-0058', 'd-0059', 'd-0060']));
    expect(ids).not.toContain('d-0024');
    expect(slice.rejected.map((r) => r.id)).toContain('r-0001');
  });
});
