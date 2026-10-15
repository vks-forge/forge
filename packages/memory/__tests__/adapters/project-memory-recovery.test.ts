/**
 * Project memory crash-recovery tests — a write that died halfway never poisons the next one.
 *
 * Why: approving a proposal is several file steps before one commit. If the daemon dies in
 *   between, the Director must not find one record id in two folders, must not let a second
 *   answer succeed on a ghost copy, and must not fold stray leftovers into a later commit
 *   that names a different record. These tests put a real repository into each crash state
 *   by running the first steps of a real plan, then drive the next write.
 *
 * Pins: duplicate ids are a typed error naming both paths; a half-finished approve is
 *   completed (recover commit, one copy, second answer refused); a crash before the move
 *   finished rolls back to the last commit, staged or not; stray files never ride along
 *   in the next commit; readers see committed state while the tree is torn.
 * Depends on: adapters/git-project-memory, domain/memory-plans, shared/atomic-write,
 *   @forge/core, vitest, git on PATH. IO: temp folder.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryRecordStateError } from '@forge/core';
import type { ProjectMemory } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProjectMemory } from '#/adapters/git-project-memory/create-project-memory.js';
import { loadRecords } from '#/adapters/git-project-memory/records.js';
import { planApprove } from '#/domain/memory-plans.js';
import { removeFile, writeFileAtomic } from '#/shared/atomic-write.js';

let root: string;
let dir: string;
let memory: ProjectMemory;

const source = { type: 'chat', ref: 'the owner said so' } as const;
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

const subjects = (): string[] => git('log', '--format=%s').split('\n');
const names = async (folder: string): Promise<string[]> =>
  (await readdir(join(dir, folder)).catch(() => [] as string[])).sort();

/** Runs the first steps of a real approve, then "crashes" before the commit. */
async function crashApprove(upTo: 'write' | 'remove'): Promise<void> {
  const change = planApprove(
    await loadRecords(dir, () => undefined),
    '2026-10-15T11:00:00.000Z',
    'x-0001',
    'vikash',
  );

  for (const [relPath, text] of change.write) {
    await writeFileAtomic(dir, join(dir, ...relPath.split('/')), text);
  }

  if (upTo === 'remove') {
    for (const relPath of change.remove) {
      await removeFile(join(dir, ...relPath.split('/')));
    }
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-pmem-recover-'));
  dir = join(root, 'shop');
  memory = createProjectMemory({ rootDir: root, now: () => new Date() });
  await memory.writer.propose('shop', { statement: 'Use pnpm', source });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('duplicate ids', () => {
  it('loadRecords refuses an id found in two files and names both paths', async () => {
    await crashApprove('write');

    const error = await loadRecords(dir, () => undefined).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as { errorFamily?: string }).errorFamily).toBe('crash');
    expect((error as Error).message).toContain('x-0001');
    expect((error as Error).message).toMatch(/proposed[\\/]x-0001/);
    expect((error as Error).message).toMatch(/decisions[\\/]x-0001/);
  });
});

describe('a crash inside approve', () => {
  it('after the new file landed: the next write completes the move and the second answer is refused', async () => {
    await crashApprove('write');

    await expect(
      memory.writer.approve('shop', 'x-0001', 'vikash'),
    ).rejects.toBeInstanceOf(MemoryRecordStateError);

    expect(subjects()[0]).toBe('recover: complete x-0001');
    expect(await names('proposed')).toEqual([]);
    expect(await names('decisions')).toHaveLength(1);
    expect(git('status', '--porcelain')).toBe('');
    expect((await memory.reader.list('shop')).map((r) => r.id)).toEqual(['x-0001']);
  });

  it('after the proposal was removed but before the commit: rolls back to the last commit and the approve can be retried', async () => {
    await crashApprove('remove');

    await memory.writer.propose('shop', { statement: 'Use vitest', source });

    expect(subjects()).toEqual([
      'memory: propose x-0002: Use vitest',
      'memory: propose x-0001: Use pnpm',
      'memory: initialise repository',
    ]);

    expect(await names('decisions')).toEqual([]);
    expect(await names('proposed')).toHaveLength(2);
    await expect(
      memory.writer.approve('shop', 'x-0001', 'vikash'),
    ).resolves.toMatchObject({
      id: 'x-0001',
    });
  });

  it('staged but uncommitted leftovers also roll back to the last commit', async () => {
    await crashApprove('remove');
    git('add', '-A');

    await memory.writer.propose('shop', { statement: 'Use vitest', source });

    expect(await names('decisions')).toEqual([]);
    expect(subjects()).toHaveLength(3);
  });
});

describe('stray changes', () => {
  it('an untracked leftover is discarded, not committed under the next write', async () => {
    const stray = join(dir, 'decisions', 'd-0099-stray.md');
    await mkdir(join(dir, 'decisions'), { recursive: true });
    await writeFile(stray, 'leftover');
    await writeFile(join(dir, 'MEMORY.md'), 'torn index');

    await memory.writer.propose('shop', { statement: 'Use vitest', source });

    expect(existsSync(stray)).toBe(false);
    const files = git('show', '--name-only', '--format=', 'HEAD').split('\n').sort();
    expect(files).toEqual(['MEMORY.md', expect.stringMatching(/^proposed\/x-0002/)]);
    expect(await names('decisions')).toEqual([]);
  });

  it('a clean repository is left alone: no recover commit', async () => {
    await memory.writer.propose('shop', { statement: 'Use vitest', source });

    expect(subjects().some((s) => s.startsWith('recover:'))).toBe(false);
  });
});

describe('an interrupted initialisation', () => {
  it('a repository with no commit yet is finished by the next write', async () => {
    const fresh = join(root, 'blog');
    execFileSync('git', ['init', '-q', '-b', 'main', fresh]);

    await memory.writer.propose('blog', { statement: 'Use hugo', source });

    const log = execFileSync('git', ['log', '--format=%s'], {
      cwd: fresh,
      encoding: 'utf8',
    })
      .trim()
      .split('\n');

    expect(log).toEqual([
      'memory: propose x-0001: Use hugo',
      'memory: initialise repository',
    ]);
  });
});
