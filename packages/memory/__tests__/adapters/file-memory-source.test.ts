/**
 * File memory source tests — pin which records reach the Director as constraints.
 *
 * Why: the Director must obey active decisions and avoid rejected approaches, and must
 *   never treat superseded, proposed or malformed records as constraints. A slug from a
 *   chat must not be able to read outside the memory root. These tests pin that filter
 *   against temp trees so the format cannot drift.
 *
 * Pins: status filter, proposed/outcomes never read, skip reporting, slug safety,
 *   slug-folder only (no flat fallback), id ordering, committed content only (a write in
 *   flight, or a folder that is not a repository, never changes or empties the slice).
 * Depends on: adapters/file-memory-source, shared/git, @forge/core (MemorySource type).
 */

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemorySource } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileMemorySource } from '#/adapters/file-memory-source.js';
import { runGit } from '#/shared/git.js';

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

/** Commits whatever the test put under `<root>/<slug>` (as the Director's writer would). */
async function seal(slug: string): Promise<void> {
  const dir = join(root, slug);
  if (!/^[a-z][a-z0-9-]*$/.test(slug) || !existsSync(dir)) {
    return;
  }

  if (!existsSync(join(dir, '.git'))) {
    await runGit(dir, ['init', '-q', '-b', 'main']);
  }

  await runGit(dir, ['add', '-A']);
  await runGit(dir, ['commit', '-q', '--allow-empty', '-m', 'seal']);
}

/** A source over the temp root that commits the test's files before each read. */
function sealed(deps?: Parameters<typeof createFileMemorySource>[1]): MemorySource {
  const inner = createFileMemorySource(root, deps);

  return {
    async slice(slug) {
      await seal(slug);

      return inner.slice(slug);
    },
  };
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
    const source: MemorySource = sealed();
    expect(typeof source.slice).toBe('function');
  });

  it('returns only active decisions, sorted by id', async () => {
    const dir = join(root, 'proj', 'decisions');
    await put(dir, 'd-0002-b.md', rec('d-0002', 'active'));
    await put(dir, 'd-0001-a.md', rec('d-0001', 'active'));
    await put(dir, 'd-0003-c.md', rec('d-0003', 'superseded'));
    await put(join(root, 'proj', 'proposed'), 'x-0001.md', rec('x-0001', 'pending'));
    await put(join(root, 'proj', 'outcomes', '2026-10'), 'o.md', rec('d-0009', 'active'));

    const slice = await sealed().slice('proj');

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

    const slice = await sealed().slice('proj');

    expect(slice.rejected.map((r) => r.id)).toEqual(['r-0001', 'r-0002', 'r-0003']);
  });

  it('returns an empty slice for an unknown project', async () => {
    const slice = await sealed({ onSkip }).slice('nope');
    expect(slice).toEqual({ decisions: [], rejected: [] });
    expect(skips).toEqual([]);
  });

  it('handles a project with decisions but no rejected folder', async () => {
    await put(join(root, 'proj', 'decisions'), 'd-0001.md', rec('d-0001', 'active'));
    const slice = await sealed().slice('proj');
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

    const slice = await sealed({ onSkip }).slice('proj');

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
    const slice = await sealed().slice('proj');
    expect(slice.decisions).toEqual([]);
  });

  it('rejects slugs that could escape the root', async () => {
    await put(join(root, 'decisions'), 'd-0001.md', rec('d-0001', 'active'));
    const source = sealed({ onSkip });
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
    const slice = await sealed().slice('proj');
    expect(slice.decisions.map((d) => d.statement)).toEqual(['slug']);
  });

  it('does not read a flat layout: that is the dev team memory shape, not a project', async () => {
    await put(join(root, 'decisions'), 'd-0002.md', rec('d-0002', 'active', 'flat'));
    const slice = await sealed().slice('forge');
    expect(slice).toEqual({ decisions: [], rejected: [] });
  });
});

describe('committed content only', () => {
  it('a write in flight does not change what the slice sees', async () => {
    const decisions = join(root, 'proj', 'decisions');
    await put(decisions, 'd-0001.md', rec('d-0001', 'active'));
    await put(join(root, 'proj', 'rejected'), 'r-0001.md', rec('r-0001', null));
    await seal('proj');

    // Mid-supersede: the old decision is already marked superseded, the new one not yet written.
    await put(decisions, 'd-0001.md', rec('d-0001', 'superseded'));
    await put(decisions, 'd-0002.md', rec('d-0002', 'active'));
    await rm(join(root, 'proj', 'rejected', 'r-0001.md'));

    const slice = await createFileMemorySource(root).slice('proj');

    expect(slice.decisions.map((d) => d.id)).toEqual(['d-0001']);
    expect(slice.rejected.map((r) => r.id)).toEqual(['r-0001']);
  });

  it('sees the new state once the write is committed', async () => {
    const decisions = join(root, 'proj', 'decisions');
    await put(decisions, 'd-0001.md', rec('d-0001', 'active'));
    await seal('proj');
    await put(decisions, 'd-0001.md', rec('d-0001', 'superseded'));
    await put(decisions, 'd-0002.md', rec('d-0002', 'active'));
    await seal('proj');

    const slice = await createFileMemorySource(root).slice('proj');

    expect(slice.decisions.map((d) => d.id)).toEqual(['d-0002']);
  });

  it('a folder that is not a repository, or has no commit, yields an empty slice and a report', async () => {
    await put(join(root, 'plain', 'decisions'), 'd-0001.md', rec('d-0001', 'active'));

    const slice = await createFileMemorySource(root, { onSkip }).slice('plain');

    expect(slice).toEqual({ decisions: [], rejected: [] });
    expect(skips.map((s) => s.reason)).toEqual([expect.stringMatching(/repository/)]);
  });
});
